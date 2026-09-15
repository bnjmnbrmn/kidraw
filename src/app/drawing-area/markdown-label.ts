/**
 * Inline markdown for node labels: **bold**, *italic* (or _italic_), `code`
 * and $math$ (TeX), with backslash escapes. Pure: parsing, the source-view
 * colouring and line layout live here; DANode draws the result with Konva,
 * and math-renderer.ts turns TeX into images.
 *
 * Deliberately small. Anything that doesn't form a closed pair stays literal,
 * so plain text, prices and half-typed markup read as typed.
 */

export interface InlineStyle {
  bold: boolean;
  italic: boolean;
  code: boolean;
  /** The span's text is TeX. */
  math: boolean;
}

export interface InlineSpan extends InlineStyle {
  text: string;
}

/** How a stretch of the raw text is shown while editing. */
export type SourceRole = 'text' | 'marker' | 'code' | 'math';

export interface SourceSpan {
  /** Raw-text index range, end exclusive. */
  start: number;
  end: number;
  role: SourceRole;
  bold: boolean;
  italic: boolean;
}

export interface ParsedLabel {
  /** What is rendered, markers removed. */
  spans: InlineSpan[];
  /** Every character of the raw text, classified for the source view. */
  source: SourceSpan[];
}

const ESCAPABLE = new Set(['\\', '*', '_', '`', '$']);

/** Cheap check: could this text contain markup at all? */
export function hasInlineMarkdown(text: string): boolean {
  return /[*_`\\$]/.test(text);
}

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/**
 * The closing `$` of math whose TeX starts at `from`, or -1. Like pandoc: the
 * TeX can't start or end with a space and the closing `$` can't be followed by
 * a digit, so "costs $5 or $6" stays text. `\$` inside is TeX's own dollar.
 */
function mathEnd(text: string, from: number): number {
  if (isSpace(text[from]) || text[from] === '$') return -1;
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') { j++; continue; }
    if (text[j] === '\n') return -1;
    if (text[j] === '$') return !isSpace(text[j - 1]) && !/\d/.test(text[j + 1] ?? '') ? j : -1;
  }
  return -1;
}

export function parseInlineMarkdown(text: string): ParsedLabel {
  const spans: InlineSpan[] = [];
  const source: SourceSpan[] = [];
  let bold = false;
  let italic: '*' | '_' | null = null;

  const emit = (chunk: string, kind: 'text' | 'code' | 'math' = 'text') => {
    if (!chunk) return;
    const style = {bold, italic: italic !== null, code: kind === 'code', math: kind === 'math'};
    const last = spans[spans.length - 1];
    // Two formulas side by side stay two formulas.
    if (last && !style.math && sameStyle(last, style)) {
      last.text += chunk;
    } else {
      spans.push({text: chunk, ...style});
    }
  };
  const mark = (start: number, end: number, role: SourceRole) => {
    if (start >= end) return;
    const last = source[source.length - 1];
    const style = {bold, italic: italic !== null};
    if (last && last.end === start && last.role === role && last.bold === style.bold && last.italic === style.italic) {
      last.end = end;
    } else {
      source.push({start, end, role, ...style});
    }
  };

  /** A closing delimiter for `token` at or after `from`, or -1. */
  const findCloser = (token: string, from: number): number => {
    for (let j = from; j <= text.length - token.length; j++) {
      if (text[j] === '\\') { j++; continue; }
      if (text[j] === '`') {
        const end = text.indexOf('`', j + 1);
        if (end !== -1) { j = end; continue; }
      }
      if (text[j] === '$') {
        const end = mathEnd(text, j + 1);
        if (end !== -1) { j = end; continue; }
      }
      if (!text.startsWith(token, j) || isSpace(text[j - 1])) continue;
      if (token === '*' && (text[j + 1] === '*' || text[j - 1] === '*')) continue;
      if (token === '_' && isWordChar(text[j + 1])) continue;
      return j;
    }
    return -1;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\' && ESCAPABLE.has(text[i + 1])) {
      mark(i, i + 1, 'marker');
      mark(i + 1, i + 2, 'text');
      emit(text[i + 1]);
      i += 2;
      continue;
    }

    if (ch === '$') {
      const end = mathEnd(text, i + 1);
      if (end !== -1) {
        mark(i, i + 1, 'marker');
        mark(i + 1, end, 'math');
        mark(end, end + 1, 'marker');
        emit(text.slice(i + 1, end), 'math');
        i = end + 1;
        continue;
      }
    }

    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        mark(i, i + 1, 'marker');
        mark(i + 1, end, 'code');
        mark(end, end + 1, 'marker');
        emit(text.slice(i + 1, end), 'code');
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith('**', i)) {
      if (bold && !isSpace(text[i - 1])) {
        mark(i, i + 2, 'marker');
        bold = false;
        i += 2;
        continue;
      }
      if (!bold && !isSpace(text[i + 2]) && findCloser('**', i + 3) !== -1) {
        bold = true;
        mark(i, i + 2, 'marker');
        i += 2;
        continue;
      }
    }

    if (ch === '*' || ch === '_') {
      const canClose = italic === ch && !isSpace(text[i - 1]) && !(ch === '_' && isWordChar(text[i + 1]));
      if (canClose) {
        mark(i, i + 1, 'marker');
        italic = null;
        i++;
        continue;
      }
      const canOpen = italic === null && !isSpace(text[i + 1]) && !(ch === '_' && isWordChar(text[i - 1]))
        && findCloser(ch, i + 2) !== -1;
      if (canOpen) {
        italic = ch;
        mark(i, i + 1, 'marker');
        i++;
        continue;
      }
    }

    mark(i, i + 1, 'text');
    emit(ch);
    i++;
  }
  return {spans, source};
}

/** A run's size: its width, and how far it reaches above and below the baseline. */
export interface RunMetrics {
  width: number;
  ascent: number;
  descent: number;
}

export interface LaidRun extends RunMetrics {
  text: string;
  style: InlineStyle;
  /** Offset from the start of the line. */
  x: number;
}

export interface LaidLine {
  runs: LaidRun[];
  /** Without trailing spaces, for centring. */
  width: number;
  /** The tallest run's reach above and below the baseline: a line with a
   *  fraction on it is taller than one without. */
  ascent: number;
  descent: number;
}

/** A width alone means an ordinary text run, with the text's own ascent and descent. */
export type MeasureRun = (text: string, style: InlineStyle) => number | RunMetrics;

interface Piece {
  text: string;
  style: InlineStyle;
  kind: 'word' | 'space' | 'newline';
}

/**
 * Word-wrap styled spans into lines no wider than `maxWidth` (when `wrap`).
 * A word wider than a whole line is broken between characters; a formula is
 * never broken, and gets a line to itself if it has to.
 */
export function layoutSpans(
  spans: InlineSpan[],
  maxWidth: number,
  measure: MeasureRun,
  wrap = true,
  textMetrics: {ascent: number; descent: number} = {ascent: 0, descent: 0},
): LaidLine[] {
  const metricsOf = (text: string, style: InlineStyle): RunMetrics => {
    const measured = measure(text, style);
    return typeof measured === 'number' ? {width: measured, ...textMetrics} : measured;
  };
  const widthOf = (piece: Piece) => metricsOf(piece.text, piece.style).width;

  const pieces: Piece[] = [];
  for (const span of spans) {
    const style = {bold: span.bold, italic: span.italic, code: span.code, math: span.math};
    if (span.math) {
      pieces.push({text: span.text, style, kind: 'word'});
      continue;
    }
    for (const part of span.text.split(/(\n| +)/)) {
      if (!part) continue;
      pieces.push({text: part, style, kind: part === '\n' ? 'newline' : part[0] === ' ' ? 'space' : 'word'});
    }
  }

  const lines: Piece[][] = [[]];
  let lineWidth = 0;
  const current = () => lines[lines.length - 1];
  const newLine = () => { lines.push([]); lineWidth = 0; };
  /** Place words that can't wait for a space, breaking between characters (never inside math). */
  const placeUnbroken = (parts: Piece[]) => {
    for (const part of parts) {
      for (const unit of part.style.math ? [part.text] : [...part.text]) {
        const width = metricsOf(unit, part.style).width;
        if (lineWidth + width > maxWidth && lineWidth > 0) newLine();
        current().push({text: unit, style: part.style, kind: 'word'});
        lineWidth += width;
      }
    }
  };

  for (const piece of pieces) {
    if (piece.kind === 'newline') { newLine(); continue; }
    if (piece.kind === 'space' && current().length === 0 && lines.length > 1 && wrap) continue;
    const width = widthOf(piece);
    if (!wrap || lineWidth + width <= maxWidth || piece.kind === 'space') {
      current().push(piece);
      lineWidth += width;
      continue;
    }
    // Words glued to the previous piece (no space between, e.g. across a style
    // change) move to the next line together.
    const glued: Piece[] = [];
    while (current().length && current()[current().length - 1].kind === 'word') glued.unshift(current().pop()!);
    if (current().length === 0) {
      // Nothing before it on this line: it can't move, so break inside it.
      lineWidth = 0;
      placeUnbroken([...glued, piece]);
      continue;
    }
    while (current().length && current()[current().length - 1].kind === 'space') current().pop();
    newLine();
    const gluedWidth = glued.reduce((sum, p) => sum + widthOf(p), 0);
    if (gluedWidth + width <= maxWidth) {
      current().push(...glued, piece);
      lineWidth = gluedWidth + width;
    } else {
      placeUnbroken([...glued, piece]);
    }
  }

  return lines.map(line => {
    while (line.length && line[line.length - 1].kind === 'space') line.pop();
    const runs: LaidRun[] = [];
    for (const piece of line) {
      const last = runs[runs.length - 1];
      if (last && !last.style.math && !piece.style.math && sameStyle(last.style, piece.style)) {
        last.text += piece.text;
      } else {
        runs.push({text: piece.text, style: piece.style, x: 0, width: 0, ascent: 0, descent: 0});
      }
    }
    let x = 0;
    let ascent = textMetrics.ascent;
    let descent = textMetrics.descent;
    for (const run of runs) {
      const metrics = metricsOf(run.text, run.style);
      Object.assign(run, {x, ...metrics});
      x += metrics.width;
      ascent = Math.max(ascent, metrics.ascent);
      descent = Math.max(descent, metrics.descent);
    }
    return {runs, width: x, ascent, descent};
  });
}

/** The label as plain text, for places that can't render markup (status
 *  messages, chat pills): markers dropped, TeX left as its source. */
export function plainText(text: string): string {
  return parseInlineMarkdown(text).spans.map(span => span.text).join('');
}

function sameStyle(a: InlineStyle, b: InlineStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.code === b.code && a.math === b.math;
}
