import Konva from 'konva';
import {DANode} from './da-node';
import {loadMath} from './math-images';

/** The Konva.Text children of the node's markdown layer, in drawing order. */
function richTexts(node: DANode): Konva.Text[] {
  const rich = (node as any)._richLabel as Konva.Group;
  return rich.getChildren().filter(c => c instanceof Konva.Text) as Konva.Text[];
}

function makeNode(text: string): DANode {
  const node = new DANode(0, 0, text, 'n1', {fill: 'white', stroke: 'black', text: 'black'});
  node.restoreState(260, 60, 14, 'fit');
  node.applyTextOverflow();
  return node;
}

describe('DANode markdown labels', () => {
  it('leaves plain-format labels exactly as they were', () => {
    const node = makeNode('a **b** c');
    expect(node.labelFormat).toBe('plain');
    expect(node.label.fillEnabled()).toBeTrue();
    expect(richTexts(node).length).toBe(0);
  });

  it('renders markup without its markers, over an unpainted label of record', () => {
    const node = makeNode('call `f` **now**');
    node.setLabelFormat('markdown');
    expect(node.label.text()).toBe('call `f` **now**');
    expect(node.label.fillEnabled()).toBeFalse();
    const runs = richTexts(node).map(t => [t.text(), t.fontStyle(), t.fontFamily().includes('monospace')]);
    expect(runs).toEqual([['call ', 'normal', false], ['f', 'normal', true], [' ', 'normal', false], ['now', 'bold', false]]);
  });

  it('paints markdown without markup as an ordinary label', () => {
    const node = makeNode('Socrates is a man');
    node.setLabelFormat('markdown');
    expect(node.label.fillEnabled()).toBeTrue();
    expect(richTexts(node).length).toBe(0);
  });

  it('fits the box to the rendered text, not the markers', () => {
    const plain = makeNode('**bold** and **more bold**');
    const markdown = makeNode('**bold** and **more bold**');
    markdown.setLabelFormat('markdown');
    expect(markdown.NODE_WIDTH).toBeLessThan(plain.NODE_WIDTH);
  });

  it('edits as monospace source with faded markers, and renders again afterwards', () => {
    const node = makeNode('a **b**');
    node.setLabelFormat('markdown');
    node.showCursor();
    expect(node.label.fontFamily()).toContain('monospace');
    const source = richTexts(node).map(t => [t.text(), t.opacity()]);
    expect(source).toEqual([['a ', 1], ['**', 0.45], ['b', 1], ['**', 0.45]]);
    node.insertAtCursor(' c');
    expect(node.label.text()).toBe('a **b** c');
    expect(richTexts(node).map(t => t.text())).toContain(' c');

    node.hideCursor();
    expect(node.label.fontFamily()).toBe('Arial');
    expect(richTexts(node).map(t => t.text())).toEqual(['a ', 'b', ' c']);
  });

  it('draws math as an image that makes its line taller, and colors the TeX while editing', async () => {
    await loadMath();
    // A larger font, so one line of text clears the node's minimum height.
    const markdownNode = (text: string) => {
      const node = makeNode(text);
      node.restoreState(260, 60, 28, 'fit');
      node.setLabelFormat('markdown');
      return node;
    };
    // \dfrac, not \frac: an inline \frac is compact enough to fit an ordinary line.
    const fraction = markdownNode('so $\\dfrac{a+b}{c+d}$ holds');
    const inline = markdownNode('so $a$ holds');
    const images = (node: DANode) => ((node as any)._richLabel as Konva.Group).getChildren().filter(c => c instanceof Konva.Image);
    expect(images(fraction).length).toBe(1);
    expect(richTexts(fraction).map(t => t.text())).toEqual(['so ', ' holds']);
    expect(fraction.NODE_HEIGHT).toBeGreaterThan(inline.NODE_HEIGHT);

    fraction.showCursor();
    // The monospace source wraps, so the TeX can be split across lines.
    const tex = richTexts(fraction).find(t => t.text().includes('dfrac'));
    expect(tex?.fill()).toBe('#a855f7');
    fraction.hideCursor();
  }, 60000); // loading MathJax, a large lazy chunk, can take longer than the 5 s default

  it('reports a resize when editing switches fonts', () => {
    const node = makeNode('**a fairly long bold statement**');
    node.setLabelFormat('markdown');
    const before = node.NODE_WIDTH;
    const resized = node.showCursor();
    expect(resized).toBe(node.NODE_WIDTH !== before);
    expect(node.hideCursor()).toBe(resized);
  });
});
