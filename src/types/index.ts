export type Verbosity = 'verbatim' | 'intense';

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
}

export interface AppSettings {
  openrouterApiKey: string;
  llmModel: string;
  ttsProvider: 'openrouter';
  ttsVoice: string;
  ttsModel: string;
  ttsRate: number;
  defaultVerbosity: Verbosity;
  autoReadOnQuestion: boolean;
  resetChatOnNewQuestion: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  openrouterApiKey: '',
  llmModel: '',
  ttsProvider: 'openrouter',
  ttsVoice: '',
  ttsModel: '',
  ttsRate: 1.1,
  defaultVerbosity: 'verbatim',
  autoReadOnQuestion: false,
  resetChatOnNewQuestion: true,
};

export const WHY_WRONG_LABELS: Record<WhyWrong, string> = {
  knowledge_gap: 'Knowledge gap',
  misread: 'Misread question',
  forgot_value: 'Forgot lab/cutoff value',
  wrong_ddx: 'Wrong differential',
  test_strategy: 'Test-taking strategy',
  other: 'Other',
};
