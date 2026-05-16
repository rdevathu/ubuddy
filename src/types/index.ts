export type WhyWrong =
  | 'knowledge_gap'
  | 'misread'
  | 'forgot_value'
  | 'wrong_ddx'
  | 'test_strategy'
  | 'other';

export interface AnswerChoice {
  letter: string;
  text: string;
  percentage?: number;
  isCorrect?: boolean;
  isUserPick?: boolean;
}

export interface LabValue {
  name: string;
  value: string;
  unit?: string;
  reference?: string;
  status: 'normal' | 'low' | 'high' | 'unknown';
}

export interface ParsedQuestion {
  questionHash: string;
  stem: string;
  vitals: LabValue[];
  labs: LabValue[];
  choices: AnswerChoice[];
  questionId?: string;
  questionNumber?: string;
  /**
   * Text of any exhibit / media / image links found in the stem. UWorld
   * renders these as bare `<a>exhibit</a>` anchors (Angular click handlers,
   * no href) — `textContent` flattens them to a plain word, so the user can
   * easily miss that there is something to open. One entry per anchor.
   */
  exhibits: string[];
}

export interface ParsedExplanation {
  questionHash: string;
  explanationText: string;
  correctLetter: string;
  userLetter?: string;
  wasCorrect: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface QuestionRecord {
  id?: number;
  questionHash: string;
  questionId?: string;
  timestamp: number;
  stem: string;
  choices: { letter: string; text: string }[];
  userPick: string;
  correctAnswer: string;
  wasCorrect: boolean;
  explanationText?: string;
  whyWrong?: WhyWrong;
  keyLearning?: string;
  /**
   * The uuid returned by StepBuddy's `log_mistake` RPC once this miss has been
   * pushed. Presence = "already logged" — the dedup guard so an SPA re-emit or
   * panel reopen never double-logs (the RPC has no upsert; every call inserts).
   */
  stepbuddyMistakeId?: string;
}

export interface AppSettings {
  openrouterApiKey: string;
  llmModel: string;
  ttsProvider: 'openrouter';
  ttsVoice: string;
  ttsModel: string;
  ttsRate: number;
  autoReadOnQuestion: boolean;
  resetChatOnNewQuestion: boolean;
  /**
   * StepBuddy mistake-log integration. When enabled and signed in, every wrong
   * answer is auto-pushed to the user's StepBuddy mistake log. Credentials are
   * stored here (same posture as `openrouterApiKey`: chrome.storage.local,
   * never injected into the page) so the session can be silently re-minted if
   * the refresh token is ever rejected.
   */
  stepbuddyEnabled: boolean;
  stepbuddyEmail: string;
  stepbuddyPassword: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  openrouterApiKey: '',
  llmModel: '',
  ttsProvider: 'openrouter',
  ttsVoice: '',
  ttsModel: '',
  ttsRate: 1.1,
  autoReadOnQuestion: false,
  resetChatOnNewQuestion: true,
  stepbuddyEnabled: false,
  stepbuddyEmail: '',
  stepbuddyPassword: '',
};

export const WHY_WRONG_LABELS: Record<WhyWrong, string> = {
  knowledge_gap: 'Knowledge gap',
  misread: 'Misread question',
  forgot_value: 'Forgot lab/cutoff value',
  wrong_ddx: 'Wrong differential',
  test_strategy: 'Test-taking strategy',
  other: 'Other',
};
