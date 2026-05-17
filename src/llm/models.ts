/**
 * OpenRouter /models discovery + cache. Text-output (chat) models only —
 * audio/TTS support was removed.
 * Schema mirrors the OpenAPI spec: each model has id, name, description,
 * architecture.output_modalities, pricing.
 */

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
  };
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string;
  };
  supported_parameters?: string[];
}

export interface ModelCatalog {
  llm: ModelInfo[];
  fetchedAt: number;
}

const CACHE_KEY = 'ubuddy.models';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ENDPOINT = 'https://openrouter.ai/api/v1/models';

export async function fetchModels(apiKey?: string): Promise<ModelCatalog> {
  const url = `${ENDPOINT}?output_modalities=all`;
  console.log('[ubuddy:models] fetching', url);
  const headers: Record<string, string> = {
    'HTTP-Referer': 'https://github.com/local/ubuddy',
    'X-Title': 'UBuddy',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[ubuddy:models] ✗', res.status, body.slice(0, 300));
    throw new Error(`Models ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: ModelInfo[] };
  const data = Array.isArray(json.data) ? json.data : [];
  console.log('[ubuddy:models] ✓ received', data.length, 'models');

  const llm: ModelInfo[] = [];
  for (const m of data) {
    const out = m.architecture?.output_modalities ?? [];
    const isAudioOnly = out.length > 0 && !out.includes('text');
    if (out.includes('text') || (!isAudioOnly && out.length === 0)) llm.push(m);
  }
  llm.sort((a, b) => a.id.localeCompare(b.id));
  console.log('[ubuddy:models] text models:', llm.length);

  const catalog: ModelCatalog = { llm, fetchedAt: Date.now() };
  await browser.storage.local.set({ [CACHE_KEY]: catalog });
  return catalog;
}

export async function loadCachedModels(): Promise<ModelCatalog | null> {
  const stored = await browser.storage.local.get(CACHE_KEY);
  const cat = stored[CACHE_KEY] as ModelCatalog | undefined;
  if (!cat) return null;
  return cat;
}

export function isStale(catalog: ModelCatalog | null): boolean {
  if (!catalog) return true;
  return Date.now() - catalog.fetchedAt > CACHE_TTL_MS;
}

export function priceLabel(m: ModelInfo): string {
  const p = m.pricing;
  if (!p) return '';
  const prompt = p.prompt ? `$${(parseFloat(p.prompt) * 1_000_000).toFixed(2)}/M in` : '';
  const completion = p.completion ? `$${(parseFloat(p.completion) * 1_000_000).toFixed(2)}/M out` : '';
  const parts = [prompt, completion].filter(Boolean);
  return parts.join(' · ');
}
