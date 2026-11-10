import { guardScore } from './ai.js';
import type { PageFacts } from './facts.js';

export type InjectionResult = {
  flagged: boolean;
  /** Highest Prompt Guard probability seen (0..1); null when the guard model was unavailable. */
  guardScore: number | null;
  heuristicHit: boolean;
  where?: 'hidden text' | 'HTML comment' | 'attribute' | 'visible text';
  snippet?: string;
  method: 'prompt-guard' | 'heuristic' | 'prompt-guard + heuristic' | 'none';
  segmentsScanned: number;
};

export const PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|earlier|all)\b.{0,20}\b(instructions?|rules?|prompts?)\b/i,
  /\b(mark|set|report|treat|consider)\b.{0,40}\b(all|every|each)\b.{0,30}\b(criteria|criterion|requirements?|checks?|items?)\b.{0,30}\b(pass(ed)?|complete[d]?|met|satisf(ied|y))\b/i,
  /\b(ai|llm|automated|language model)\s+(reviewer|inspector|judge|grader|evaluator|assistant)\b/i,
  /\b(system prompt|you are now|new instructions|developer mode)\b/i,
  /\b(approve|release)\b.{0,30}\b(payment|funds|milestone)\b/i,
];

type Segment = { where: NonNullable<InjectionResult['where']>; text: string };

export function segmentsOf(f: PageFacts): Segment[] {
  const visible: Segment[] = [];
  for (let i = 0; i < f.visibleText.length && visible.length < 6; i += 500) visible.push({ where: 'visible text', text: f.visibleText.slice(i, i + 500) });
  return [
    ...f.hiddenText.map((t) => ({ where: 'hidden text' as const, text: t })),
    ...f.comments.map((t) => ({ where: 'HTML comment' as const, text: t })),
    ...f.attrText.map((t) => ({ where: 'attribute' as const, text: t })),
    ...visible,
  ];
}

/**
 * Two independent detectors over the text a human reviewer never sees (hidden text, comments, attributes)
 * and the visible text: Llama Prompt Guard 2 (Groq) and pattern rules. Either one flags the page.
 * Hidden text gets a lower guard threshold, since text addressed to an AI has no legitimate reason to be invisible.
 */
export async function scanForInjection(f: PageFacts): Promise<InjectionResult> {
  // Groq's free tier allows about 30 requests a minute, so the guard sees at most 10 segments, scanned in parallel.
  const scanned = segmentsOf(f).slice(0, 10);
  const scores = await Promise.all(scanned.map((s) => guardScore(s.text).catch(() => null)));
  const guardUp = scores.some((s) => s !== null);

  let guardHit: { i: number; score: number } | null = null;
  let best: number | null = guardUp ? 0 : null;
  scores.forEach((score, i) => {
    if (score === null) return;
    best = Math.max(best ?? 0, score);
    const threshold = scanned[i].where === 'visible text' ? 0.9 : 0.6;
    if (score >= threshold && (!guardHit || score > guardHit.score)) guardHit = { i, score };
  });
  const heurIdx = scanned.findIndex((s) => PATTERNS.some((p) => p.test(s.text)));
  const heuristicHit = heurIdx >= 0;
  const hitIdx = guardHit ? (guardHit as { i: number }).i : heurIdx;

  if (!guardHit && !heuristicHit) {
    return { flagged: false, guardScore: best, heuristicHit: false, method: 'none', segmentsScanned: scanned.length };
  }
  return {
    flagged: true,
    guardScore: best,
    heuristicHit,
    where: scanned[hitIdx].where,
    snippet: scanned[hitIdx].text.slice(0, 220),
    method: guardHit && heuristicHit ? 'prompt-guard + heuristic' : guardHit ? 'prompt-guard' : 'heuristic',
    segmentsScanned: scanned.length,
  };
}
