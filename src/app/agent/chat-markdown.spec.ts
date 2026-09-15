import {ChatPiece, chatCopyText, chatPieces} from './chat-markdown';

/** Compact form: B/I/C flags for text, $…$ for math, [ref:id] for pills. */
const describePieces = (pieces: ChatPiece[]) => pieces.map(piece => {
  if (piece.kind === 'ref') return `[ref:${piece.id}|${piece.label}]`;
  if (piece.kind === 'math') return `$${piece.tex}$`;
  return `${piece.bold ? 'B' : ''}${piece.italic ? 'I' : ''}${piece.code ? 'C' : ''}(${piece.text})`;
});

describe('chat markdown', () => {
  it('renders pills, bold, italic, code and math, with bullets and headings made readable', () => {
    const pieces = chatPieces('## Plan\n- Read [[ref:n1|Start]] with **care**\n- then `x` and *also* $x^2$');
    expect(describePieces(pieces)).toEqual([
      'B(Plan)', '(\n• Read )', '[ref:n1|Start]', '( with )', 'B(care)', '(\n• then )', 'C(x)', '( and )', 'I(also)', '( )', '$x^2$',
    ]);
  });

  it('leaves plain text as one piece', () => {
    expect(describePieces(chatPieces('Nothing special here.'))).toEqual(['(Nothing special here.)']);
  });

  it('copies markdown with pills turned back into their labels', () => {
    expect(chatCopyText('See [[ref:n1|Start]] **now**, and $x^2$.')).toBe('See Start **now**, and $x^2$.');
  });
});
