import {parseInlineMarkdown} from '../drawing-area/markdown-label';
import {parseRefSegments} from './agent-refs';

/** One piece of a rendered chat message. */
export type ChatPiece =
  | {kind: 'text'; text: string; bold: boolean; italic: boolean; code: boolean}
  | {kind: 'math'; tex: string}
  | {kind: 'ref'; id: string; label: string};

/**
 * A chat message as rendered pieces: reference pills, inline markdown (bold,
 * italic, code) and TeX math, the same markup node labels use. List bullets
 * and headings are made readable rather than laid out as blocks; newlines stay
 * for the panel's pre-wrap styling.
 */
export function chatPieces(text: string): ChatPiece[] {
  const pieces: ChatPiece[] = [];
  for (const segment of parseRefSegments(text)) {
    if (segment.kind === 'ref') {
      pieces.push(segment);
      continue;
    }
    const readable = segment.text
      .replace(/^(\s*)[-*+] (?=\S)/gm, '$1• ')
      .replace(/^#{1,6}\s+(.+)$/gm, '**$1**');
    for (const span of parseInlineMarkdown(readable).spans) {
      pieces.push(span.math
        ? {kind: 'math', tex: span.text}
        : {kind: 'text', text: span.text, bold: span.bold, italic: span.italic, code: span.code});
    }
  }
  return pieces;
}

/** The message as markdown for the clipboard, e.g. to paste into a node label:
 *  reference pills become their labels. */
export function chatCopyText(text: string): string {
  return parseRefSegments(text).map(segment => (segment.kind === 'ref' ? segment.label : segment.text)).join('');
}
