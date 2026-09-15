/**
 * Inline markdown for node labels: **bold**, *italic* (or _italic_) and
 * `code`, with backslash escapes. Pure: parsing, the source-view colouring and
 * line layout live here; DANode draws the result with Konva.
 *
 * Deliberately small. Anything that doesn't form a closed pair stays literal,
 * so plain text and half-typed markup read as typed. Math is planned next
 * (see notes/design-explanation-graphs.md).
 */

export interface InlineStyle {
  bold: boolean;
  italic: boolean;
  code: boolean;
}

export interface InlineSpan extends InlineStyle {
  text: string;
}

/** How a stretch of the raw text is shown while editing. */
export type SourceRole = 'text' | 'marker' | 'code';

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

const ESCAPABLE = new Set(['\\', '*', '_', '`']);

/** Cheap check: could this text contain markup at all? */
export function hasInlineMarkdown(text: string): boolean {
  return /[*_`\\]/.test(text);
}

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

export function parseInlineMarkdown(text: string): ParsedLabel {
  const spans: InlineSpan[] = [];
  const source: SourceSpan[] = [];
  let bold = false;
  let italic: '*' | '_' | null = null;

  const emit = (chunk: string, code = false) => {
    if (!chunk) return;
    const style = {bold, italic: italic !== null, code};
    const last = spans[spans.length - 1];
    if (last && last.bold === style.bold && last.italic === style.italic && last.code === style.code) {
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

    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        mark(i, i + 1, 'marker');
        mark(i + 1, end, 'code');
        mark(end, end + 1, 'marker');
        emit(text.slice(i + 1, end), true);
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

export interface LaidRun {
  text: string;
  style: InlineStyle;
  /** Offset from the start of the line. */
  x: number;
  width: number;
}

export interface LaidLine {
  runs: LaidRun[];
  /** Without trailing spaces, for centring. */
  width: number;
}

export type MeasureRun = (text: string, style: InlineStyle) => number;

interface Piece {
  text: string;
  style: InlineStyle;
  kind: 'word' | 'space' | 'newline';
}

/**
 * Word-wrap styled spans into lines no wider than `maxWidth` (when `wrap`).
 * A word wider than a whole line is broken between characters.
 */
export function layoutSpans(spans: InlineSpan[], maxWidth: number, measure: MeasureRun, wrap = true): LaidLine[] {
  const pieces: Piece[] = [];
  for (const span of spans) {
    const style = {bold: span.bold, italic: span.italic, code: span.code};
    for (const part of span.text.split(/(\n| +)/)) {
      if (!part) continue;
      pieces.push({text: part, style, kind: part === '\n' ? 'newline' : part[0] === ' ' ? 'space' : 'word'});
    }
  }

  const lines: Piece[][] = [[]];
  let lineWidth = 0;
  const current = () => lines[lines.length - 1];
  const newLine = () => { lines.push([]); lineWidth = 0; };

  for (const piece of pieces) {
    if (piece.kind === 'newline') { newLine(); continue; }
    if (piece.kind === 'space' && current().length === 0 && lines.length > 1 && wrap) continue;
    const width = measure(piece.text, piece.style);
    if (!wrap || lineWidth + width <= maxWidth || piece.kind === 'space') {
      current().push(piece);
      lineWidth += width;
      continue;
    }
    // Words glued to the previous piece (no space between, e.g. across a style
    // change) move to the next line together.
    const glued: Piece[] = [];
    while (current().length && current()[current().length - 1].kind === 'word') glued.unshift(current().pop()!);
    const gluedWidth = glued.reduce((sum, p) => sum + measure(p.text, p.style), 0);
    if (current().length === 0) {
      // Nothing before it on this line: it can't move, so break inside it.
      glued.push(piece);
      lineWidth = 0;
      for (const part of glued) {
        for (const char of part.text) {
          const w = measure(char, part.style);
          if (lineWidth + w > maxWidth && lineWidth > 0) newLine();
          current().push({text: char, style: part.style, kind: 'word'});
          lineWidth += w;
        }
      }
      continue;
    }
    while (current().length && current()[current().length - 1].kind === 'space') current().pop();
    newLine();
    if (gluedWidth + width <= maxWidth) {
      current().push(...glued, piece);
      lineWidth = gluedWidth + width;
    } else {
      for (const part of [...glued, piece]) {
        for (const char of part.text) {
          const w = measure(char, part.style);
          if (lineWidth + w > maxWidth && lineWidth > 0) newLine();
          current().push({text: char, style: part.style, kind: 'word'});
          lineWidth += w;
        }
      }
    }
  }

  return lines.map(line => {
    while (line.length && line[line.length - 1].kind === 'space') line.pop();
    const runs: LaidRun[] = [];
    let x = 0;
    for (const piece of line) {
      const last = runs[runs.length - 1];
      if (last && sameStyle(last.style, piece.style)) {
        last.text += piece.text;
      } else {
        runs.push({text: piece.text, style: piece.style, x, width: 0});
      }
      const run = runs[runs.length - 1];
      run.width = measure(run.text, run.style);
      x = run.x + run.width;
    }
    return {runs, width: x};
  });
}

function sameStyle(a: InlineStyle, b: InlineStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.code === b.code;
}
