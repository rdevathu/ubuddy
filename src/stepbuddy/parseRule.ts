/**
 * Hashtag tokenizer for the takeaway textarea — mirrors StepBuddy's
 * quick-add parser (see stepbuddy-v2 components/guided-add-mistake.tsx).
 *
 * A `#token` only counts as a tag when it sits at the start of the string
 * or right after whitespace, so URL fragments and inline `#1`-style notes
 * inside prose don't accidentally become tags. Tokens are extracted from
 * the rule body, deduped (case-insensitive), capped at 20, and the `#tag`
 * substrings are stripped from the cleaned rule that gets sent.
 *
 * Tags only ever come from text the human typed. The auto-draft path
 * sanitizes `#` out of the streamed LLM deltas before they hit the
 * textarea, so no AI-emitted hashtag can survive into the parsed tag set.
 */

const TAG_TOKEN_REGEX = /(^|\s)#([A-Za-z0-9_-]+)/g;

export interface ParsedRule {
  rule: string;
  tags: string[];
}

export function parseRule(text: string): ParsedRule {
  const tags: string[] = [];
  const seen = new Set<string>();
  const cleaned = text.replace(TAG_TOKEN_REGEX, (_m, prefix: string, tag: string) => {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
    return prefix;
  });
  const rule = cleaned
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/\s+$/, ''))
    .join('\n')
    .trim();
  return { rule, tags: tags.slice(0, 20) };
}
