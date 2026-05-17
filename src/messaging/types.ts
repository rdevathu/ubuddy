import type { ParsedExplanation, ParsedQuestion } from '../types';

export type RuntimeMessage =
  | { type: 'question:loaded'; payload: ParsedQuestion }
  | { type: 'explanation:shown'; payload: ParsedExplanation }
  | { type: 'choice:selected'; payload: { letter: string } }
  | { type: 'panel:requestParse' }
  | { type: 'panel:forwardClick'; payload: { letter: string } }
  | { type: 'panel:openSidePanel' }
  | { type: 'llm:complete'; payload: { messages: { role: string; content: string }[]; model?: string } };

export type RuntimeMessageType = RuntimeMessage['type'];

export type RuntimeMessageOf<T extends RuntimeMessageType> = Extract<RuntimeMessage, { type: T }>;
