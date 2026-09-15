/**
 * Reference pills: agents write canvas references as `[[ref:ID|Label]]` in
 * their replies (see agent/src/tools.ts SESSION_PREAMBLE); the chat renders
 * each one as a pill that focuses the object.
 */

export type RefSegment =
  | {kind: 'text'; text: string}
  | {kind: 'ref'; id: string; label: string};

const REF_PATTERN = /\[\[ref:([^|\]\s]+)(?:\|([^\]]*))?\]\]/g;

/** Split text into plain runs and reference pills. A ref without a label uses its id. */
export function parseRefSegments(text: string): RefSegment[] {
  const segments: RefSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(REF_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({kind: 'text', text: text.slice(last, start)});
    const label = (match[2] ?? '').trim();
    segments.push({kind: 'ref', id: match[1], label: label || match[1]});
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({kind: 'text', text: text.slice(last)});
  return segments;
}
