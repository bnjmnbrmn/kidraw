/**
 * Small subsequence fuzzy matcher for popup filtering (nav popup, and later
 * the vault fuzzy finder / command palette). Case-insensitive: every query
 * character must appear in order in the candidate. Optimal alignment by
 * dynamic programming — candidates are short labels, so O(q·c²) is nothing —
 * scoring consecutive runs and word starts, with earlier matches winning
 * ties.
 */

export interface FuzzyResult {
  /** Higher is better. Comparable only for the same query. */
  score: number;
  /** Indices of the matched characters in the candidate. */
  positions: number[];
}

const CONSECUTIVE_BONUS = 12;
const WORD_START_BONUS = 10;
const START_BONUS = 6;
const GAP_PENALTY = 1;
const MAX_GAP_PENALTY = 10;

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  return prev === ' ' || prev === '-' || prev === '_' || prev === '/' || prev === '.';
}

/** Match `query` against `candidate`; null when it isn't a subsequence. */
export function fuzzyMatch(query: string, candidate: string): FuzzyResult | null {
  if (query.length === 0) return {score: 0, positions: []};
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  const qn = q.length;
  const cn = c.length;
  if (qn > cn) return null;

  const NEG = -1e9;
  // best[qi][ci]: best score matching q[0..qi] with q[qi] at candidate ci.
  const best: number[][] = Array.from({length: qn}, () => new Array<number>(cn).fill(NEG));
  const from: number[][] = Array.from({length: qn}, () => new Array<number>(cn).fill(-1));

  for (let ci = 0; ci < cn; ci++) {
    if (c[ci] !== q[0]) continue;
    best[0][ci] = (isWordStart(candidate, ci) ? WORD_START_BONUS : 0)
      + (ci === 0 ? START_BONUS : 0)
      - Math.floor(ci / 4); // earlier first match wins ties
  }
  for (let qi = 1; qi < qn; qi++) {
    for (let ci = qi; ci < cn; ci++) {
      if (c[ci] !== q[qi]) continue;
      for (let cj = qi - 1; cj < ci; cj++) {
        if (best[qi - 1][cj] === NEG) continue;
        const gap = ci - cj - 1;
        const scoreHere = best[qi - 1][cj]
          + (gap === 0 ? CONSECUTIVE_BONUS : -Math.min(gap, MAX_GAP_PENALTY) * GAP_PENALTY)
          + (isWordStart(candidate, ci) ? WORD_START_BONUS : 0);
        if (scoreHere > best[qi][ci]) {
          best[qi][ci] = scoreHere;
          from[qi][ci] = cj;
        }
      }
    }
  }

  let endCi = -1;
  for (let ci = 0; ci < cn; ci++) {
    if (best[qn - 1][ci] !== NEG && (endCi < 0 || best[qn - 1][ci] > best[qn - 1][endCi])) {
      endCi = ci;
    }
  }
  if (endCi < 0) return null;

  const positions = new Array<number>(qn);
  let ci = endCi;
  for (let qi = qn - 1; qi >= 0; qi--) {
    positions[qi] = ci;
    ci = from[qi][ci];
  }
  return {score: best[qn - 1][endCi], positions};
}
