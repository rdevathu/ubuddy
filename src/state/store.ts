import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ChatMessage,
  type ParsedExplanation,
  type ParsedQuestion,
} from '../types';
import type { MissType, SystemTag } from '../stepbuddy/client';

export interface LogFormState {
  /** True once the student opens the card (auto for wrong, on-click for right). */
  open: boolean;
  /** The takeaway, draft or final. */
  rule: string;
  /** How they want to categorize it for StepBuddy. */
  missType: MissType;
  /**
   * Manual system_tag override. `null` means "use the value mapped from
   * UWorld's `.standards` label" — the rare-case escape hatch is when the
   * student disagrees with UWorld's category or UWorld renamed something we
   * don't recognize.
   */
  systemOverride: SystemTag | null;
  /** True while the LLM is streaming an auto-draft into `rule`. */
  drafting: boolean;
}

export interface AppState {
  settings: AppSettings;
  question: ParsedQuestion | null;
  explanation: ParsedExplanation | null;
  selectedLetter: string | null;
  parserHealth: { ok: boolean; missing: string[] } | null;
  logForm: LogFormState;
  chat: ChatMessage[];
  chatStreaming: boolean;
  loggedCount: number;
  stepbuddy: { status: 'idle' | 'logging' | 'logged' | 'error'; message?: string };
  /**
   * For AMBOSS only: the LLM-classified `SystemTag` for the current question.
   * Filled in shortly after `setQuestion` fires (background classify call),
   * cached on the `QuestionRecord` so we don't reclassify on revisit. UWorld
   * leaves this null — its system comes deterministically from `.standards`.
   */
  classifiedSystem: SystemTag | null;
  classifying: boolean;

  setSettings: (s: AppSettings) => void;
  setQuestion: (q: ParsedQuestion | null) => void;
  setExplanation: (e: ParsedExplanation | null) => void;
  setSelectedLetter: (l: string | null) => void;
  setParserHealth: (h: { ok: boolean; missing: string[] } | null) => void;
  setLogForm: (patch: Partial<LogFormState>) => void;
  appendLogFormRule: (s: string) => void;
  resetChat: () => void;
  appendChatMessage: (m: ChatMessage) => void;
  updateChatMessage: (id: string, content: string) => void;
  setChatStreaming: (b: boolean) => void;
  setLoggedCount: (n: number) => void;
  setStepbuddy: (s: { status: 'idle' | 'logging' | 'logged' | 'error'; message?: string }) => void;
  setClassifiedSystem: (s: SystemTag | null) => void;
  setClassifying: (b: boolean) => void;
}

const FRESH_LOG_FORM: LogFormState = {
  open: false,
  rule: '',
  missType: 'knowledge',
  systemOverride: null,
  drafting: false,
};

export const useStore = create<AppState>((set) => ({
  settings: DEFAULT_SETTINGS,
  question: null,
  explanation: null,
  selectedLetter: null,
  parserHealth: null,
  logForm: FRESH_LOG_FORM,
  chat: [],
  chatStreaming: false,
  loggedCount: 0,
  stepbuddy: { status: 'idle' },
  classifiedSystem: null,
  classifying: false,

  setSettings: (settings) => set({ settings }),
  // Opening a new question wipes per-question scratch state. Chat resets too —
  // the previous question's transcript is irrelevant.
  setQuestion: (question) =>
    set({
      question,
      explanation: null,
      selectedLetter: null,
      logForm: FRESH_LOG_FORM,
      stepbuddy: { status: 'idle' },
      chat: [],
      classifiedSystem: null,
      classifying: false,
    }),
  setExplanation: (explanation) => set({ explanation }),
  setSelectedLetter: (selectedLetter) => set({ selectedLetter }),
  setParserHealth: (parserHealth) => set({ parserHealth }),
  setLogForm: (patch) => set((state) => ({ logForm: { ...state.logForm, ...patch } })),
  appendLogFormRule: (s) =>
    set((state) => ({ logForm: { ...state.logForm, rule: state.logForm.rule + s } })),
  resetChat: () => set({ chat: [] }),
  appendChatMessage: (m) => set((state) => ({ chat: [...state.chat, m] })),
  updateChatMessage: (id, content) =>
    set((state) => ({
      chat: state.chat.map((m) => (m.id === id ? { ...m, content } : m)),
    })),
  setChatStreaming: (chatStreaming) => set({ chatStreaming }),
  setLoggedCount: (loggedCount) => set({ loggedCount }),
  setStepbuddy: (stepbuddy) => set({ stepbuddy }),
  setClassifiedSystem: (classifiedSystem) => set({ classifiedSystem }),
  setClassifying: (classifying) => set({ classifying }),
}));
