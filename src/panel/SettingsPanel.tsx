import { useEffect, useMemo, useState } from 'react';
import { recentQuestions } from '../storage/db';
import { saveSettings } from '../storage/settings';
import { useStore } from '../state/store';
import type { AppSettings, QuestionRecord } from '../types';
import {
  fetchModels,
  isStale,
  loadCachedModels,
  priceLabel,
  type ModelCatalog,
  type ModelInfo,
} from '../llm/models';

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [history, setHistory] = useState<QuestionRecord[]>([]);

  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [llmFilter, setLlmFilter] = useState('');
  const [ttsFilter, setTtsFilter] = useState('');

  useEffect(() => setDraft(settings), [settings]);

  useEffect(() => {
    recentQuestions(20).then(setHistory);
  }, [savedAt]);

  // Load cached catalog on mount; refresh if stale.
  useEffect(() => {
    (async () => {
      const cached = await loadCachedModels();
      if (cached) setCatalog(cached);
      if (settings.openrouterApiKey && (isStale(cached) || !cached)) {
        await refreshCatalog();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshCatalog() {
    setLoadingModels(true);
    setModelError(null);
    try {
      const next = await fetchModels(draft.openrouterApiKey || settings.openrouterApiKey);
      setCatalog(next);
    } catch (e) {
      setModelError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModels(false);
    }
  }

  async function save() {
    const next = await saveSettings(draft);
    setSettings(next);
    setSavedAt(Date.now());
  }

  function update<K extends keyof AppSettings>(key: K, val: AppSettings[K]) {
    setDraft({ ...draft, [key]: val });
  }

  const filteredLLM = useMemo(
    () => filterModels(catalog?.llm ?? [], llmFilter),
    [catalog, llmFilter],
  );
  const filteredTTS = useMemo(
    () => filterModels(catalog?.tts ?? [], ttsFilter),
    [catalog, ttsFilter],
  );

  const selectedTTS = useMemo(
    () => catalog?.tts.find((m) => m.id === draft.ttsModel),
    [catalog, draft.ttsModel],
  );

  return (
    <div className="body">
      <div className="card">
        <h3>OpenRouter</h3>
        <label>
          API key
          <input
            type="password"
            value={draft.openrouterApiKey}
            onChange={(e) => update('openrouterApiKey', e.target.value)}
            placeholder="sk-or-..."
          />
        </label>
        <div className="row">
          <button className="btn btn--small" onClick={refreshCatalog} disabled={loadingModels}>
            {loadingModels ? 'Loading models…' : catalog ? 'Refresh model list' : 'Load models'}
          </button>
          {catalog && (
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
              {catalog.llm.length} LLM · {catalog.tts.length} TTS · cached {timeAgo(catalog.fetchedAt)}
            </span>
          )}
        </div>
        {modelError && <div className="banner banner--err">{modelError}</div>}
      </div>

      <div className="card">
        <h3>Chat model</h3>
        <ModelPicker
          models={filteredLLM}
          value={draft.llmModel}
          filter={llmFilter}
          setFilter={setLlmFilter}
          onPick={(id) => update('llmModel', id)}
          totalCount={catalog?.llm.length ?? 0}
        />
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Current: {draft.llmModel || '(none)'}</div>
      </div>

      <div className="card">
        <h3>Voice</h3>
        <ModelPicker
          models={filteredTTS}
          value={draft.ttsModel}
          filter={ttsFilter}
          setFilter={setTtsFilter}
          onPick={(id) => {
            // single setDraft so the model + auto-picked voice land together
            setDraft((d) => {
              const m = catalog?.tts.find((x) => x.id === id);
              const needNewVoice =
                !!m?.supported_voices?.length && !m.supported_voices.includes(d.ttsVoice);
              return {
                ...d,
                ttsModel: id,
                ttsVoice: needNewVoice ? m!.supported_voices![0] : d.ttsVoice,
              };
            });
          }}
          totalCount={catalog?.tts.length ?? 0}
          showVoices
        />
        <label>
          Voice
          {selectedTTS?.supported_voices && selectedTTS.supported_voices.length > 0 ? (
            <select
              value={draft.ttsVoice}
              onChange={(e) => update('ttsVoice', e.target.value)}
            >
              {selectedTTS.supported_voices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={draft.ttsVoice}
              onChange={(e) => update('ttsVoice', e.target.value)}
              placeholder="alloy"
            />
          )}
        </label>

        <label>
          Speech rate ({draft.ttsRate.toFixed(2)}x)
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.05}
            value={draft.ttsRate}
            onChange={(e) => update('ttsRate', parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className="card">
        <h3>Defaults</h3>
        <label>
          Default verbosity
          <select
            value={draft.defaultVerbosity}
            onChange={(e) => update('defaultVerbosity', e.target.value as AppSettings['defaultVerbosity'])}
          >
            <option value="verbatim">Verbatim</option>
            <option value="intense">Intense</option>
          </select>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={draft.autoReadOnQuestion}
            onChange={(e) => update('autoReadOnQuestion', e.target.checked)}
          />
          <span>Auto-read on new question</span>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={draft.resetChatOnNewQuestion}
            onChange={(e) => update('resetChatOnNewQuestion', e.target.checked)}
          />
          <span>Clear chat on new question</span>
        </label>
      </div>

      <div className="row row--end">
        <button className="btn btn--primary" onClick={save}>
          Save
        </button>
      </div>
      {savedAt && <div className="banner banner--ok">Saved.</div>}

      <div className="card">
        <h3>Recent reflections</h3>
        {history.length === 0 ? (
          <div className="empty">No saved questions yet.</div>
        ) : (
          <div className="history">
            {history.map((h) => (
              <div key={h.id} className="history__row">
                <div>
                  {new Date(h.timestamp).toLocaleDateString()} · {h.wasCorrect ? '✓' : '✗'} {h.userPick} → {h.correctAnswer}
                </div>
                {h.keyLearning && <div style={{ color: 'var(--fg)' }}>{h.keyLearning}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ModelPickerProps {
  models: ModelInfo[];
  value: string;
  filter: string;
  setFilter: (s: string) => void;
  onPick: (id: string) => void;
  totalCount: number;
  showVoices?: boolean;
}

function ModelPicker({ models, value, filter, setFilter, onPick, totalCount, showVoices }: ModelPickerProps) {
  if (totalCount === 0) {
    return (
      <div className="empty">
        Click "Load models" above to fetch available options from OpenRouter.
      </div>
    );
  }
  return (
    <>
      <input
        type="text"
        placeholder={`Filter ${totalCount} models…`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        {models.length === 0 ? (
          <div className="empty">No matches.</div>
        ) : (
          models.slice(0, 80).map((m) => {
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                onClick={() => onPick(m.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: selected ? 'var(--bg-hi)' : 'transparent',
                  color: 'var(--fg)',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: selected ? 600 : 400 }}>
                  {m.id}
                  {selected && ' ✓'}
                </div>
                <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
                  {priceLabel(m) || '—'}
                  {showVoices && m.supported_voices?.length
                    ? ` · ${m.supported_voices.length} voices`
                    : ''}
                </div>
              </button>
            );
          })
        )}
        {models.length > 80 && (
          <div className="empty" style={{ fontSize: 11 }}>
            … {models.length - 80} more — refine filter.
          </div>
        )}
      </div>
    </>
  );
}

function filterModels(models: ModelInfo[], filter: string): ModelInfo[] {
  const q = filter.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) =>
    [m.id, m.name, m.description ?? ''].some((s) => s.toLowerCase().includes(q)),
  );
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
