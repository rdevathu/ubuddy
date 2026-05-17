import type { ParsedExplanation, ParsedQuestion } from '../types';
import { summarizeLabsForLLM } from '../uworld/labs';

/**
 * Strip anything that even smells like the answer or rationale. The intense
 * summary must NEVER see the explanation — its job is to compress the case,
 * not solve it.
 */
function sanitizeStemForIntense(stem: string): string {
  const markers = [
    /\bExplanation:?/i,
    /\bEducational objective:?/i,
    /\bCorrect answer\b/i,
    /\bThis patient (most likely )?has\b/i, // typical first line of UWorld explanations
  ];
  let cut = stem.length;
  for (const re of markers) {
    const m = stem.match(re);
    if (m && m.index != null && m.index < cut) cut = m.index;
  }
  return stem.slice(0, cut).trim();
}

/**
 * Pull the actual interrogative question out of the stem (the "Which of the
 * following…" or equivalent). Falls back to the last sentence if nothing ends
 * with a question mark.
 */
function extractQuestionLine(stem: string): string {
  const sentences = stem.match(/[^.?!]+[.?!]/g) ?? [];
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i].trim();
    if (s.endsWith('?')) return s;
  }
  return sentences[sentences.length - 1]?.trim() ?? stem.trim();
}

export function intensePrompt(question: ParsedQuestion): { system: string; user: string } {
  const stem = sanitizeStemForIntense(question.stem);
  const labLine = summarizeLabsForLLM(question.labs);
  const finalQuestion = extractQuestionLine(stem);

  return {
    system: [
      'You are running INTENSE mode for a med student blazing through UWorld questions.',
      'Your output is shown on screen as a tight blaze-through summary while the student reads the choices.',
      '',
      '═══ OUTPUT FORMAT (INVIOLABLE) ═══',
      'ONE single paragraph of plain prose. 2-3 short sentences. As terse as a glance allows.',
      'NO markdown. NO headings (no "##", no "Clinical Summary:", no "Question:", no "Stem:", no labels of any kind).',
      'NO bullet points, NO numbered lists, NO bold, NO italics, NO code blocks, NO line breaks within the paragraph.',
      'If you find yourself about to write a label like "Summary:" or "Question:" — STOP. Just write the prose.',
      '',
      '═══ CONTENT STRUCTURE ═══',
      '1) Lead with age, sex, key history, chief complaint — telegraphic, no filler words.',
      '2) Pertinent positives/negatives the stem volunteers (PMH, exam, imaging, labs as relevant).',
      '3) End with the actual question from the stem, restated verbatim. The whole thing flows as one paragraph.',
      '',
      '═══ STRICT RULES ═══',
      '- DO NOT include the answer choices. The student reads them on screen.',
      '- DO NOT solve, hint at, or favor any choice. No differential, no diagnosis, no test interpretation.',
      '- DO NOT introduce any information not in the stem.',
      '- NO units anywhere — never write "mm Hg", "milligrams per deciliter", "Celsius", "per minute". Just the number.',
      '- All temperatures are already in Fahrenheit. Never write Celsius.',
      '- Render "80/50" as "80 over 50".',
      '- Skip lab values that are within normal limits unless the stem specifically draws attention to one.',
      '- Avoid filler verbs: no "the patient", no "presents with", no "comes to the clinic".',
      '',
      '═══ EXAMPLE OUTPUT (this is the exact tone/format) ═══',
      '48-year-old woman, 6 months progressive urinary incontinence, initially with sneezing and coughing, now constant urge with small voiding volumes. Frequent day voids, nocturia, daily pad use, two vaginal deliveries in her 20s, two to three cups of coffee daily, no dysuria or hematuria. Which of the following is the best next step in management of this patient?',
      '',
      'Notice: one paragraph, no labels, no markdown, ends with the verbatim question. Match this format exactly.',
    ].join('\n'),
    user: [
      'STEM (this is the only patient information you may use):',
      stem,
      '',
      `ABNORMAL LABS (already classified, units stripped, temp in °F): ${labLine}`,
      '',
      `THE ACTUAL QUESTION TO RESTATE VERBATIM AT THE END: ${finalQuestion}`,
      '',
      'Produce ONE paragraph. No labels. No markdown. Telegraphic case + abnormal findings + the question.',
    ].join('\n'),
  };
}

export function chatSystemPrompt(question: ParsedQuestion, explanation?: ParsedExplanation): string {
  const lines = [
    'You are a sharp medical-board tutor helping a student review a UWorld question.',
    'Use the provided question, choices, and (when present) the official explanation to answer follow-ups.',
    'Be specific and concise. Cite the relevant detail from the stem when justifying an answer.',
    "If the student is wrong about a fact, correct them gently and explain why.",
    '',
    '=== QUESTION ===',
    question.stem,
    '',
    '=== CHOICES ===',
    ...question.choices.map(
      (c) => `${c.letter}. ${c.text}${c.isCorrect ? '   [correct]' : ''}${c.isUserPick ? '   [student picked]' : ''}`,
    ),
  ];
  if (explanation) {
    lines.push('');
    lines.push('=== OFFICIAL EXPLANATION ===');
    lines.push(explanation.explanationText);
    lines.push('');
    lines.push(
      `Student answered ${explanation.userLetter ?? '(none yet)'}; correct is ${explanation.correctLetter}.`,
    );
  }
  return lines.join('\n');
}

