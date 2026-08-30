/**
 * The caret must sit where the text is painted.
 *
 * This is the 2026-08-30 bug generalised: the label moved inside the box
 * (padding, and the inscribed rectangle for circles) and the caret model
 * kept measuring against the node's width, so the caret drew mid-word and
 * would not walk past the end of a line that only the measurement believed
 * in. One assertion, run over a matrix, would have failed the moment the
 * label moved.
 */
import {DANode} from '../app/drawing-area/da-node';
import {NodeShape, TextOverflowMode} from '../app/drawing-area/command.model';

const TEXTS = [
  'short',
  'a label long enough to wrap onto two lines in a default box',
  'In edit mode, the "Go ahead and type. Press ..." and the "edit" indicator are overlapping. Keep them separated.',
  'oneverylongunbrokenwordthatcannotwrapatall',
];
const SHAPES: NodeShape[] = ['box', 'circle', 'diamond'];
// 'clip' is excluded on purpose: it truncates the painted text, so "the end
// of the last painted line" is not where the caret belongs — the caret is
// past the clip. Worth its own contract one day; not this one.
const MODES: TextOverflowMode[] = ['fit', 'widen-both'];

/** The last painted line, as Konva laid it out. */
function lastLine(node: DANode): {text: string; width: number} | null {
  const lines: {text: string; width: number}[] = (node.label as any).textArr ?? [];
  return lines.length ? lines[lines.length - 1] : null;
}

describe('caret geometry follows the painted text', () => {
  for (const shape of SHAPES) {
    for (const mode of MODES) {
      for (const text of TEXTS) {
        const label = `${shape}/${mode}/"${text.slice(0, 18)}…"`;

        it(`ends where the last line ends — ${label}`, () => {
          const node = new DANode(0, 0, text, undefined, undefined, shape);
          node.textOverflowMode = mode;
          node.setCursorToEnd();
          node.showCursor();

          const line = lastLine(node);
          if (!line) return;                       // nothing painted, nothing to check
          const l = node.label;
          // An unbreakable word wider than the label overflows its box; the
          // centring maths cannot put the caret at its end and still be
          // inside. Out of scope here, like clipping.
          if (line.width > l.width()) return;
          const expected = l.x() + (l.width() - line.width) / 2 + line.width;

          // 2px, not sub-pixel: Konva's own line width (textArr) and
          // measureSize() of the same string disagree by ~1.3px on an
          // unbreakable word. The bug this guards against moved the caret by
          // 40px, so the tolerance costs nothing and the flake costs a lot.
          expect(Math.abs(node.caretViewportBox().x - expected)).toBeLessThanOrEqual(2);
        });

      }
    }
  }

  // Sampling every index of every combination is thousands of Konva text
  // measurements; a couple of shapes at a stride is enough to catch a caret
  // that leaves the box.
  for (const shape of ['box', 'circle'] as NodeShape[]) {
    it(`stays inside the label box while walking back — ${shape}`, () => {
      const text = TEXTS[2];
      const node = new DANode(0, 0, text, undefined, undefined, shape);
      node.textOverflowMode = 'fit';
      node.showCursor();
      node.setCursorToEnd();
      const l = node.label;
      for (let i = text.length; i >= 0; i -= 7) {
        const box = node.caretViewportBox();
        expect(box.x).withContext(`index ${i}`).toBeGreaterThanOrEqual(l.x() - 1);
        expect(box.x).withContext(`index ${i}`).toBeLessThanOrEqual(l.x() + l.width() + 1);
        node.moveCursorH(-7);
      }
    });
  }

  it('walks the whole string with no dead end', () => {
    // "I can't move it beyond the point in the screenshot": the caret index
    // stopped advancing because the line ranges it walked were measured at a
    // width nothing is drawn at.
    const text = TEXTS[2];
    const node = new DANode(0, 0, text);
    node.textOverflowMode = 'fit';
    node.setCursorToEnd();
    expect(node.cursorIndex).toBe(text.length);

    for (let i = 0; i < text.length; i++) node.moveCursorH(-1);
    expect(node.cursorIndex).toBe(0);

    for (let i = 0; i < text.length; i++) node.moveCursorH(1);
    expect(node.cursorIndex).toBe(text.length);
  });
});
