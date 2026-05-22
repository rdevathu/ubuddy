/**
 * Which question bank this parse came from. Drives the StepBuddy `p_source`
 * value, the per-source identifier shape, and (for AMBOSS) whether the LLM
 * needs to classify the system — UWorld's `.standards` block gives us the
 * system deterministically; AMBOSS exposes nothing equivalent.
 */
export type QuestionSource = 'uworld' | 'amboss';

export interface AnswerChoice {
  letter: string;
  text: string;
  percentage?: number;
  isCorrect?: boolean;
  isUserPick?: boolean;
}

export interface ParsedQuestion {
  source: QuestionSource;
  questionHash: string;
  stem: string;
  choices: AnswerChoice[];
  questionId?: string;
  questionNumber?: string;
  /**
   * Text of any exhibit / media / image links found in the stem. UWorld
   * renders these as bare `<a>exhibit</a>` anchors (Angular click handlers,
   * no href) — `textContent` flattens them to a plain word, so the user can
   * easily miss that there is something to open. One entry per anchor.
   * AMBOSS exposes nothing equivalent in the DOM; the array stays empty.
   */
  exhibits: string[];
}

export interface ParsedExplanation {
  questionHash: string;
  explanationText: string;
  correctLetter: string;
  userLetter?: string;
  wasCorrect: boolean;
  /**
   * UWorld's labeled metadata, scraped from the `.standards` block at the
   * bottom of the explanation:
   *   - subject: discipline / rotation (e.g. "Pediatrics", "Internal Medicine")
   *   - system:  organ-system taxonomy (e.g. "Gastrointestinal & Nutrition") —
   *              this is what we map onto StepBuddy's SystemTag deterministically
   *   - topic:   specific diagnosis / concept (e.g. "Necrotizing enterocolitis")
   * Any field may be absent on older / unusual question types.
   */
  subject?: string;
  system?: string;
  topic?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface QuestionRecord {
  id?: number;
  questionHash: string;
  source?: QuestionSource;
  questionId?: string;
  timestamp: number;
  stem: string;
  choices: { letter: string; text: string }[];
  userPick: string;
  correctAnswer: string;
  wasCorrect: boolean;
  explanationText?: string;
  /** The student's own takeaway — the rule sent to StepBuddy on log. */
  rule?: string;
  /**
   * LLM-classified `SystemTag` cached per question. Only populated for AMBOSS
   * (UWorld is deterministic via `.standards`). Re-used when the user logs so
   * we don't burn tokens on a second classify if they revisit a question.
   */
  classifiedSystem?: string;
  /**
   * The uuid returned by StepBuddy's `log_mistake` RPC once this question has
   * been logged. Presence = "already logged" — the dedup guard so an SPA
   * re-emit or panel reopen never double-logs (the RPC has no upsert; every
   * call inserts). Used for both wrong-answer mistakes and right-answer
   * "pure_learning" entries.
   */
  stepbuddyMistakeId?: string;
}

export interface AppSettings {
  openrouterApiKey: string;
  stepbuddyEmail: string;
  stepbuddyPassword: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  openrouterApiKey: '',
  stepbuddyEmail: '',
  stepbuddyPassword: '',
};
