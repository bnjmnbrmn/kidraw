import type {PopupRow} from '../nav-popup/nav-popup.component';
import type {NavCandidate} from './graph-nav';

export type PopupNavigationDirection = 'out' | 'in';

/** Order forward links first, then sort each direction by its bearing. */
export function orderNavCandidates(
  candidates: readonly NavCandidate[],
  forwardDir: PopupNavigationDirection,
  bearing: (candidate: NavCandidate) => number,
): NavCandidate[] {
  return [...candidates].sort((a, b) =>
    Number(a.direction !== forwardDir) - Number(b.direction !== forwardDir)
    || bearing(a) - bearing(b));
}

/** Convert graph candidates into the generic popup widget's row model. */
export function navPopupRows(
  candidates: readonly NavCandidate[],
  forwardDir: PopupNavigationDirection,
): PopupRow[] {
  const hasForward = candidates.some(candidate => candidate.direction === forwardDir);
  return candidates.map(candidate => ({
    id: candidate.edge.id,
    glyph: candidate.direction === 'out' ? '→' : '←',
    title: (candidate.other.label?.text() ?? '').trim() || '(unlabeled)',
    subtitle: candidate.edge.labels.map(label => label.label).filter(text => text.trim()).join(' · ') || undefined,
    tags: [...candidate.edge.tags, ...candidate.other.tags],
    secondary: hasForward && candidate.direction !== forwardDir,
  }));
}
