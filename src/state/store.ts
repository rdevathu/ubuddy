import { create } from 'zustand';
import { DEFAULT_SETTINGS, type AppSettings, type ChatMessage, type ParsedExplanation, type ParsedQuestion, type WhyWrong } from '../types';

export interface AppState {
  settings: AppSettings;
  question: ParsedQuestion | null;
  explanation: ParsedExplanation | null;
  selectedLetter: string | null;
  isReading: boolean;
  isSummarizing: boolean;
  intenseSummary: string;
  parserHealth: { ok: boolean; missing: string[] } | null;
  reflection: { whyWrong?: WhyWrong; keyLearning?: string; saved: boolean };
  chat: ChatMessage[];
  chatStreaming: boolean;
  streak: { current: number; total: number; correct: number };

  setSettings: (s: AppSettings) => void;
  setQuestion: (q: ParsedQuestion | null) => void;
  setExplanation: (e: ParsedExplanation | null) => void;
  setSelectedLetter: (l: string | null) => void;
  setIsReading: (b: boolean) => void;
  setIsSummarizing: (b: boolean) => void;
  setIntenseSummary: (s: string) => void;
  appendIntenseSummary: (s: string) => void;
  setParserHealth: (h: { ok: boolean; missing: string[] } | null) => void;
  setReflection: (r: { whyWrong?: WhyWrong; keyLearning?: string; saved?: boolean }) => void;
  resetChat: () => void;
  appendChatMessage: (m: ChatMessage) => void;
  updateChatMessage: (id: string, content: string) => void;
  setChatStreaming: (b: boolean) => void;
  setStreak: (s: { current: number; total: number; correct: number }) => void;
}

export const useStore = create<AppState>((set) => ({
  settings: DEFAULT_SETTINGS,
  question: null,
  explanation: null,
  selectedLetter: null,
  isReading: false,
  isSummarizing: false,
  intenseSummary: '',
  parserHealth: null,
  reflection: { saved: false },
  chat: [],
  chatStreaming: false,
  streak: { current: 0, total: 0, correct: 0 },

  setSettings: (settings) => set({ settings }),
  setQuestion: (question) =>
    set((state) => ({
      question,
      explanation: null,
      selectedLetter: null,
      intenseSummary: '',
      reflection: { saved: false },
      chat: state.settings.resetChatOnNewQuestion ? [] : state.chat,
    })),
  setExplanation: (explanation) => set({ explanation }),
  setSelectedLetter: (selectedLetter) => set({ selectedLetter }),
  setIsReading: (isReading) => set({ isReading }),
  setIsSummarizing: (isSummarizing) => set({ isSummarizing }),
  setIntenseSummary: (intenseSummary) => set({ intenseSummary }),
  appendIntenseSummary: (s) => set((state) => ({ intenseSummary: state.intenseSummary + s })),
  setParserHealth: (parserHealth) => set({ parserHealth }),
  setReflection: (patch) =>
    set((state) => ({ reflection: { ...state.reflection, ...patch } })),
  resetChat: () => set({ chat: [] }),
  appendChatMessage: (m) => set((state) => ({ chat: [...state.chat, m] })),
  updateChatMessage: (id, content) =>
    set((state) => ({
      chat: state.chat.map((m) => (m.id === id ? { ...m, content } : m)),
    })),
  setChatStreaming: (chatStreaming) => set({ chatStreaming }),
  setStreak: (streak) => set({ streak }),
}));
