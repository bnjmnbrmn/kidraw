/**
 * Pure index math for the label-edit text cursor.
 *
 * The cursor is an insertion index in [0, text.length] — it sits *between*
 * characters (like an editor caret), including in vim-normal mode. This is
 * simpler than vim's on-a-character normal cursor and good enough for label
 * editing; `deleteAtCursor` treats an at-end cursor as "on the last char" so
 * `x` still feels right there.
 *
 * Display lines (word-wrapped node labels) are handled via {@link LineRange}s
 * derived from the renderer's wrapped output — see {@link lineRangesFromWrapped}.
 */

export function clampIndex(text: string, i: number): number {
  return Math.min(Math.max(i, 0), text.length);
}

const isWordChar = (ch: string) => /\S/.test(ch);

/** Vim `w` (simplified: words are runs of non-whitespace): start of the
 *  next word, or end of text. */
export function wordForward(text: string, i: number): number {
  let j = clampIndex(text, i);
  while (j < text.length && isWordChar(text[j])) j++;
  while (j < text.length && !isWordChar(text[j])) j++;
  return j;
}

/** Vim `b`: start of the current word if mid-word, else start of the
 *  previous word. */
export function wordBack(text: string, i: number): number {
  let j = clampIndex(text, i);
  while (j > 0 && !isWordChar(text[j - 1])) j--;
  while (j > 0 && isWordChar(text[j - 1])) j--;
  return j;
}

/** Vim `0`: start of the logical (\n-delimited) line containing `i`. */
export function logicalLineStart(text: string, i: number): number {
  const j = clampIndex(text, i);
  return text.lastIndexOf('\n', j - 1) + 1;
}

/** Vim `$`: insertion point at the end of the logical line containing `i`. */
export function logicalLineEnd(text: string, i: number): number {
  const j = clampIndex(text, i);
  const nl = text.indexOf('\n', j);
  return nl === -1 ? text.length : nl;
}

/** One display line's slice of the raw text: insertion indices `start` to
 *  `start + length` (inclusive) sit on this line. */
export interface LineRange {
  start: number;
  length: number;
}

/**
 * Map the renderer's wrapped output back onto raw-text index ranges.
 *
 * `wrapped` is Konva.Text's `textArr`: the rendered line texts in order,
 * with `lastInParagraph` marking lines followed by an explicit `\n`. The
 * characters the renderer swallows between lines are the `\n` after a
 * paragraph end, or the whitespace at a word-wrap break; a mid-word hard
 * break swallows nothing. Positions are recovered by scanning forward for
 * each line's text, which absorbs all three cases (including empty lines
 * from `\n\n`, whose position is pinned by the preceding paragraph's `\n`).
 */
export function lineRangesFromWrapped(
  text: string,
  wrapped: {text: string; lastInParagraph?: boolean}[],
): LineRange[] {
  const ranges: LineRange[] = [];
  let offset = 0;
  wrapped.forEach((line, k) => {
    if (k > 0) {
      // Consume the separator the renderer swallowed after the previous line.
      if (wrapped[k - 1].lastInParagraph) {
        if (text[offset] === '\n') offset++;
      } else if (line.text.length > 0) {
        while (offset < text.length && !text.startsWith(line.text, offset)) offset++;
      }
    }
    ranges.push({start: offset, length: line.text.length});
    offset += line.text.length;
  });
  if (ranges.length === 0) ranges.push({start: 0, length: 0});
  return ranges;
}

/** Index of the display line whose range contains insertion index `i`.
 *  A wrap boundary belongs to the earlier line (its end), matching where
 *  the caret is drawn. */
export function lineIndexAt(ranges: LineRange[], i: number): number {
  for (let k = 0; k < ranges.length; k++) {
    if (i <= ranges[k].start + ranges[k].length) return k;
  }
  return ranges.length - 1;
}

/** Vim `j`/`k` over display lines: keep the column, clamp to the target
 *  line's length; no-op past the first/last line. */
export function moveVertical(ranges: LineRange[], i: number, delta: number): number {
  const k = lineIndexAt(ranges, i);
  const target = k + delta;
  if (target < 0 || target >= ranges.length) return i;
  const col = i - ranges[k].start;
  return ranges[target].start + Math.min(col, ranges[target].length);
}
