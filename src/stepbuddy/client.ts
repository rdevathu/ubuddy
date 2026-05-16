/**
 * StepBuddy mistake-log client.
 *
 * Talks straight to Supabase (Auth + the `log_mistake` Postgres RPC) over the
 * REST endpoint — there is NO custom server. We deliberately do NOT pull in
 * `@supabase/supabase-js`: its GoTrue client wants `localStorage` and a
 * background `setInterval` auto-refresh, neither of which is reliable in an
 * MV3 context. Instead this is ~one screen of `fetch`:
 *
 *   - sign in once with email + password  → store the session
 *   - lazily refresh the access token on demand, just before it's needed
 *   - POST /rest/v1/rpc/log_mistake with the bearer token
 *
 * On-demand refresh (vs. a timer) is the key MV3-robustness choice: the side
 * panel / SW can be torn down at any moment, so we never rely on a scheduled
 * callback firing — we check expiry right before each call.
 *
 * The publishable key is public by design (it already ships in the StepBuddy
 * web client) so it's fine to hardcode here.
 */

const SUPABASE_URL = 'https://dlivcxwafmssxwebzccb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_mR0AQZoHvMpvyINmkXm8rQ_mzi3vDmY';

const SESSION_KEY = 'ubuddy.stepbuddy.session';

const log = (...args: unknown[]) => console.log('[ubuddy:stepbuddy]', ...args);

export interface StepBuddySession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. We refresh when within EXPIRY_SKEW_S of this. */
  expiresAt: number;
  email: string;
}

/** Refresh this many seconds before the token actually expires. */
const EXPIRY_SKEW_S = 60;

// ── allowed enum values (mirror StepBuddy's lib/constants.ts) ────────────────
// The RPC validates these server-side; keeping the lists here lets us fail
// fast / coerce before spending a network round-trip.
export const SYSTEM_TAGS = [
  'Cardio', 'Pulm', 'GI', 'Renal', 'Endo', 'Heme', 'ID', 'Neuro', 'Psych',
  'MSK', 'Derm', 'Repro', 'OB', 'Peds', 'Surg', 'EM', 'Biostat', 'Ethics',
  'QI', 'Pharm', 'Genetics', 'Misc',
] as const;
export type SystemTag = (typeof SYSTEM_TAGS)[number];

export const MISS_TYPES = [
  'knowledge', 'framework', 'stem_error', 'right_wrong_reason', 'confused',
  'silly_mistake', 'got_lucky', 'other',
] as const;
export type MissType = (typeof MISS_TYPES)[number];

export const SOURCES = [
  'UWorld', 'AMBOSS', 'NBME', 'UWSA', 'Free 120', 'Other',
] as const;
export type Source = (typeof SOURCES)[number];

export interface LogMistakeParams {
  /** "YYYY-MM-DD" — typically today (local date). */
  p_date: string;
  p_source: Source;
  p_system_tag: SystemTag;
  /** The takeaway. 1–2000 chars. */
  p_rule: string;
  p_miss_type: MissType;
  /** Question id (e.g. the UWorld QID). ≤80 chars. */
  p_identifier?: string;
  /** Required ONLY when p_source === 'Other'. ≤80 chars. */
  p_source_other?: string | null;
  p_tags?: string[];
  p_anki_card_made?: boolean;
}

// ── session storage ─────────────────────────────────────────────────────────

export async function getSession(): Promise<StepBuddySession | null> {
  const stored = await browser.storage.local.get(SESSION_KEY);
  return (stored[SESSION_KEY] as StepBuddySession | undefined) ?? null;
}

async function setSession(s: StepBuddySession): Promise<void> {
  await browser.storage.local.set({ [SESSION_KEY]: s });
}

export async function clearSession(): Promise<void> {
  await browser.storage.local.remove(SESSION_KEY);
}

/** Best-effort human-readable error out of a Supabase/GoTrue/PostgREST body. */
function extractError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const msg =
      (b.message as string) ||
      (b.error_description as string) ||
      (b.msg as string) ||
      (typeof b.error === 'string' ? (b.error as string) : undefined) ||
      (b.hint as string);
    if (msg) return msg;
  }
  if (typeof body === 'string' && body.trim()) return body.trim();
  return `HTTP ${status}`;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sessionFromTokenResponse(json: any, fallbackEmail: string): StepBuddySession {
  const expiresAt: number =
    typeof json.expires_at === 'number'
      ? json.expires_at
      : Math.floor(Date.now() / 1000) + (Number(json.expires_in) || 3600);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    email: json.user?.email ?? fallbackEmail,
  };
}

// ── auth ────────────────────────────────────────────────────────────────────

/**
 * Sign in with email + password and persist the session. Throws on bad
 * credentials / network so the Settings UI can surface the reason.
 */
export async function signIn(email: string, password: string): Promise<StepBuddySession> {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  log('sign in', email);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await readBody(res);
  if (!res.ok) {
    log('sign in failed', res.status, body);
    throw new Error(extractError(res.status, body));
  }
  const session = sessionFromTokenResponse(body, email);
  await setSession(session);
  log('signed in as', session.email);
  return session;
}

// Coalesce concurrent refreshes (several wrong answers in quick succession).
let refreshing: Promise<string> | null = null;

async function refreshSession(session: StepBuddySession): Promise<string> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
    log('refreshing access token');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const body = await readBody(res);
    if (!res.ok) {
      // Refresh token revoked/expired — force a fresh sign-in next time.
      await clearSession();
      log('refresh failed, session cleared', res.status, body);
      throw new Error(`StepBuddy session expired — sign in again (${extractError(res.status, body)})`);
    }
    const next = sessionFromTokenResponse(body, session.email);
    await setSession(next);
    return next.accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Return a usable access token, refreshing on demand if it's expired or about
 * to be. Throws if the user has never signed in or the refresh token is dead.
 */
async function ensureAccessToken(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Not signed in to StepBuddy. Add credentials in Settings.');
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt - EXPIRY_SKEW_S > now) return session.accessToken;
  return refreshSession(session);
}

// ── the RPC ─────────────────────────────────────────────────────────────────

/**
 * Call the `log_mistake` Postgres RPC. Resolves with the new mistake's uuid.
 * Every validation failure is raised server-side as a Postgres exception and
 * surfaced here as an Error whose message is the raised reason — and on a
 * failed call nothing is written (no partial rows).
 */
export async function logMistake(params: LogMistakeParams): Promise<string> {
  const call = async (token: string): Promise<Response> =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/log_mistake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

  let token = await ensureAccessToken();
  let res = await call(token);

  // A 401 here means the token went stale between the expiry check and the
  // call (clock skew, server-side revocation). Force one refresh + retry.
  if (res.status === 401) {
    const session = await getSession();
    if (session) {
      token = await refreshSession(session);
      res = await call(token);
    }
  }

  const body = await readBody(res);
  if (!res.ok) {
    log('log_mistake failed', res.status, body);
    throw new Error(extractError(res.status, body));
  }

  // A scalar-returning PostgREST RPC gives back the bare value (a JSON string),
  // but tolerate `[{ ... }]` / object shapes too.
  let id: string;
  if (typeof body === 'string') id = body.replace(/^"|"$/g, '');
  else if (Array.isArray(body)) id = String(body[0]?.log_mistake ?? body[0] ?? '');
  else if (body && typeof body === 'object') id = String((body as any).log_mistake ?? '');
  else id = String(body ?? '');
  log('logged mistake', id);
  return id || 'ok';
}
