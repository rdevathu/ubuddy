import type { ParsedExplanation, ParsedQuestion } from '../types';

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
    /\bThis patient (most likely )?has\b/i,
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
  const finalQuestion = extractQuestionLine(stem);

  return {
    system: [
      'You are running INTENSE mode for a med student blazing through Step 2 CK questions.',
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
      `THE ACTUAL QUESTION TO RESTATE VERBATIM AT THE END: ${finalQuestion}`,
      '',
      'Produce ONE paragraph. No labels. No markdown. Telegraphic case + abnormal findings + the question.',
    ].join('\n'),
  };
}

/**
 * KEY POINTS mode — bullet-format extraction of the only stem facts the
 * student needs to answer. Same hard rule as intense mode: NEVER reveal,
 * hint at, or add anything outside the stem. This is pure compression.
 */
export function keyPointsPrompt(question: ParsedQuestion): { system: string; user: string } {
  const stem = sanitizeStemForIntense(question.stem);
  const finalQuestion = extractQuestionLine(stem);

  return {
    system: [
      'You are running KEY POINTS mode for a med student blazing through Step 2 CK questions.',
      'Your job: extract ONLY the stem facts that directly help answer the question, in tight bullet form. Compress, do not interpret.',
      '',
      '═══ OUTPUT FORMAT (INVIOLABLE) ═══',
      'A markdown bullet list. Each bullet starts with "- ". No headings, no bold, no intro line, no outro line, no labels like "Key Points:" — just bullets.',
      'Bullets are telegraphic fragments, NOT full sentences. Drop articles ("the", "a") and filler verbs ("presents with", "is found to have").',
      'Aim for 4-8 bullets total. Skip a category entirely if the stem says nothing useful about it.',
      '',
      '═══ BULLET ORDER (STRICT) ═══',
      '1) FIRST BULLET — ALWAYS the key identifying info: age, sex, chief complaint / reason for visit, duration. Example: "- 48F, 6mo progressive urinary incontinence".',
      '2) Then in order, only if the stem volunteers something useful for answering:',
      '   - HPI details (timing, triggers, character, associated symptoms)',
      '   - PMH / PSH / meds / allergies (only if relevant)',
      '   - Social / family history (only if relevant — smoking, alcohol, sexual hx, occupation, travel)',
      '   - Vitals (only the abnormal ones)',
      '   - Exam findings (only the positive/pertinent-negative ones)',
      '   - Labs / imaging / studies (only abnormal or specifically called out)',
      '3) LAST BULLET — the actual question from the stem, restated verbatim. Prefix it with "Q: ".',
      '',
      '═══ STRICT RULES ═══',
      '- DO NOT include the answer choices. The student reads them on screen.',
      '- DO NOT solve, hint at, diagnose, or interpret. No "suggests…", no "consistent with…", no differential, no next step.',
      '- DO NOT introduce ANY information not in the stem. If it is not literally in the stem, it does not go in a bullet.',
      '- SKIP normal vitals, normal labs, and irrelevant negatives. If everything is normal in a category, omit the bullet.',
      '- NO units anywhere — never write "mm Hg", "mg/dL", "Celsius", "bpm". Just the number.',
      '- All temperatures are already in Fahrenheit. Never write Celsius.',
      '- Render "80/50" as "80 over 50".',
      '- Combine related facts on one bullet when natural ("- nonsmoker, 2-3 cups coffee/day, 2 vaginal deliveries in 20s") — do not fragment a single category into many bullets.',
      '',
      '═══ EXAMPLE OUTPUT (match this exactly) ═══',
      '- 48F, 6mo progressive urinary incontinence',
      '- Initially with sneezing/coughing, now constant urge with small voiding volumes',
      '- Frequent day voids, nocturia, daily pad use',
      '- 2 vaginal deliveries in 20s, 2-3 cups coffee/day',
      '- No dysuria, no hematuria',
      '- Q: Which of the following is the best next step in management of this patient?',
    ].join('\n'),
    user: [
      'STEM (this is the only patient information you may use):',
      stem,
      '',
      `THE ACTUAL QUESTION TO RESTATE VERBATIM IN THE LAST BULLET: ${finalQuestion}`,
      '',
      'Produce ONLY the bullet list. No intro, no outro, no headings. First bullet = key identifying info. Last bullet = "Q: <verbatim question>".',
    ].join('\n'),
  };
}

export function chatSystemPrompt(question: ParsedQuestion, explanation?: ParsedExplanation): string {
  const lines = [
    '═══ IDENTITY ═══',
    'You are UBuddy, a sharp USMLE Step 2 CK tutor embedded in a side panel next to a question bank (UWorld, AMBOSS, or NBME).',
    'The student is a third-year US medical student in the final stretch of dedicated study. Time is scarce; every word should earn its place.',
    'You speak like a senior resident on rounds: direct, confident, clinically grounded. Never hedge with "it depends" — commit to the high-yield answer and name the caveat only if it changes management.',
    '',
    '═══ HOW TO ANSWER ═══',
    '- Lead with the answer. First sentence delivers the verdict; everything after justifies it.',
    '- Be concise but COMPLETE. No padding, no restating the question, no "Great question!". But do not skip the mechanism, the discriminator, or the next step if the student asked for it.',
    "- Cite the specific stem detail that drives the answer (e.g., \"the JVD + Kussmaul → constrictive, not restrictive\"). The student should see WHICH cue mattered.",
    '- When comparing choices, contrast on the single discriminating feature, not a full review of each.',
    '- If the student is factually wrong, correct them directly and explain the mechanism in one or two sentences. Don\'t soften so much that the correction is missed.',
    '- Step 2 CK rewards next-best-step thinking: when relevant, finish with the actionable management step (test, treatment, disposition).',
    '- Use Step-style shorthand the student already knows (PPV/NPV, AG, "next best step", "most likely dx").',
    '',
    '═══ FORMATTING (rendered as markdown in the side panel) ═══',
    '- Default to short paragraphs (1-3 sentences each). Use markdown only when it genuinely helps scanning.',
    '- Use **bold** for the key diagnosis, the discriminating finding, or the next step — sparingly, so it stands out.',
    '- Use bullets ONLY for true lists (differential, criteria, mechanism chain). Never bullet a single idea.',
    '- Use tables only when comparing 3+ entities on 2+ attributes. Otherwise prose is faster to read.',
    '- Use `inline code` for drugs, lab abbreviations, or eponyms when it aids parsing. No code blocks.',
    '- No headings (#, ##) inside a single answer — the chat bubble is already the container.',
    '- All temperatures in Fahrenheit. Render BP as "120/80" is fine here (unlike intense mode).',
    '',
    '═══ ANTI-PATTERNS ═══',
    '- Do not regurgitate the official explanation verbatim. Synthesize and sharpen it.',
    '- Do not refuse or disclaim ("I\'m an AI…", "consult a physician") — this is exam prep, not patient care.',
    '- Do not invent facts not in the stem/explanation. If the student asks something outside both, answer from board-canon knowledge and flag if it\'s adjacent (one short phrase, not a paragraph).',
    '- Do not lecture. The student has read the explanation already — add value on top, don\'t repeat it.',
    '',
    '═══ QUESTION CONTEXT ═══',
    'STEM:',
    question.stem,
    '',
    'CHOICES:',
    ...question.choices.map(
      (c) => `${c.letter}. ${c.text}${c.isCorrect ? '   [correct]' : ''}${c.isUserPick ? '   [student picked]' : ''}`,
    ),
  ];
  if (explanation) {
    lines.push('');
    lines.push('OFFICIAL EXPLANATION:');
    lines.push(explanation.explanationText);
    lines.push('');
    lines.push(
      `Student answered ${explanation.userLetter ?? '(none yet)'}; correct is ${explanation.correctLetter}.`,
    );
  } else {
    lines.push('');
    lines.push('NOTE: The student has not yet submitted an answer. Do NOT reveal which choice is correct unless they explicitly ask. Help them reason through the stem instead.');
  }
  return lines.join('\n');
}

/**
 * Ask the LLM to pick the single best `SystemTag` for a question. Used for
 * AMBOSS (UWorld exposes the system in the `.standards` block — no LLM
 * needed there). The list of valid tags is injected verbatim and the model
 * is constrained to return exactly one of them.
 */
export function classifySystemPrompt(
  question: ParsedQuestion,
  allowedTags: readonly string[],
): { system: string; user: string } {
  return {
    system: [
      'You classify USMLE Step 2 CK questions into a single organ-system / discipline tag.',
      'You MUST respond with EXACTLY ONE of the allowed tags below, verbatim, with no other text — no punctuation, no quotes, no explanation, no markdown.',
      'If two tags seem to fit, pick the one the question is testing on (the disease/finding the answer hinges on), not the one the patient happens to have as a side note.',
      'Use "Miscellaneous (MISC)" only when nothing else genuinely fits — prefer a specific system whenever possible.',
      '',
      'ALLOWED TAGS (return one of these, verbatim):',
      ...allowedTags.map((t) => `- ${t}`),
    ].join('\n'),
    user: [
      'STEM:',
      question.stem.slice(0, 4000),
      '',
      'CHOICES:',
      ...question.choices.map((c) => `${c.letter}. ${c.text}`),
      '',
      'Return the single best tag from the allowed list. Output ONLY the tag string, nothing else.',
    ].join('\n'),
  };
}

/**
 * Boil the official explanation + stem down to a 2-4 sentence learning rule
 * the student can stash in StepBuddy. Used by the "Auto-draft" button on the
 * log card — the student then edits before saving.
 */
export function draftLearningPrompt(
  question: ParsedQuestion,
  explanation: ParsedExplanation,
): { system: string; user: string } {
  return {
    system: [
      'You boil a med student\'s board question + its official explanation down to the takeaway they should remember.',
      'Output ONE block of 2-4 short sentences in plain prose. No markdown, no labels, no headings, no bullets.',
      'Lead with the high-yield rule. Then briefly state when/why it applies. No "the answer is…", no choice letters.',
      'Be specific to the medical fact — generic platitudes are useless ("always consider the differential" → bad).',
      'Cap at ~280 characters. Imperative voice is fine ("In a patient with X, do Y because Z.").',
    ].join('\n'),
    user: [
      'STEM:',
      question.stem.slice(0, 4000),
      '',
      'CHOICES:',
      ...question.choices.map(
        (c) => `${c.letter}. ${c.text}${c.isCorrect ? '   [correct]' : ''}${c.isUserPick ? '   [student picked]' : ''}`,
      ),
      '',
      'OFFICIAL EXPLANATION:',
      explanation.explanationText.slice(0, 6000),
      '',
      `Student picked ${explanation.userLetter ?? '(unknown)'}; correct is ${explanation.correctLetter}.`,
      '',
      'Write the takeaway now — 2-4 sentences, plain prose.',
    ].join('\n'),
  };
}
