/**
 * The one model UBuddy uses for everything (summarize, chat, classify mistake,
 * auto-draft rule). Pinned because UWorld's blaze-through workflow has zero
 * tolerance for a stale dropdown — picking the wrong slug just silently breaks
 * every LLM call.
 *
 * Verified against `GET https://openrouter.ai/api/v1/models` on 2026-05-19.
 */
export const MODEL_ID = 'google/gemini-3-flash-preview';
export const MODEL_LABEL = 'Gemini 3 Flash Preview';
