import Dexie, { type Table } from 'dexie';
import type { QuestionRecord } from '../types';

class UBuddyDB extends Dexie {
  questions!: Table<QuestionRecord, number>;

  constructor() {
    super('ubuddy');
    this.version(1).stores({
      questions: '++id, questionHash, timestamp, wasCorrect, whyWrong',
    });
  }
}

export const db = new UBuddyDB();

export async function upsertQuestion(record: Omit<QuestionRecord, 'id'>): Promise<number> {
  const existing = await db.questions.where('questionHash').equals(record.questionHash).first();
  if (existing?.id != null) {
    await db.questions.update(existing.id, record);
    return existing.id;
  }
  return db.questions.add(record as QuestionRecord);
}

export async function getQuestionByHash(hash: string): Promise<QuestionRecord | undefined> {
  return db.questions.where('questionHash').equals(hash).first();
}

/** Mark a question as pushed to StepBuddy. The dedup guard for re-emits. */
export async function setStepbuddyMistakeId(hash: string, mistakeId: string): Promise<void> {
  const existing = await db.questions.where('questionHash').equals(hash).first();
  if (existing?.id != null) {
    await db.questions.update(existing.id, { stepbuddyMistakeId: mistakeId });
  }
}

export async function recentQuestions(limit = 25): Promise<QuestionRecord[]> {
  return db.questions.orderBy('timestamp').reverse().limit(limit).toArray();
}

/** Lifetime count of questions that have been pushed to StepBuddy. */
export async function loggedCount(): Promise<number> {
  return db.questions.filter((r) => !!r.stepbuddyMistakeId).count();
}
