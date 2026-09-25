import {DAEdge} from './da-edge';
import {DANode} from './da-node';

/** A color chosen for an item used to be painted straight over the theme's,
 *  so the next theme toggle or reload painted it back
 *  (notes/bug-style-colors-not-persisted.md). A chosen color now sits over the
 *  theme's and survives it. */
describe('Colors chosen for an item', () => {
  const light = {fill: 'white', stroke: 'black', text: 'black'};
  const dark = {fill: '#222', stroke: '#ddd', text: '#eee'};

  function makeNode(id: string): DANode {
    const node = new DANode(0, 0, 'A', id, light);
    node.applyColors(light);
    return node;
  }

  it('keeps a node\'s chosen colors through a theme change', () => {
    const node = makeNode('n1');
    node.setCustomColors({fill: '#ffcccc', stroke: '#cc0000', text: '#660000'});
    node.applyColors(dark);
    expect(node.shape.fill()).toBe('#ffcccc');
    expect(node.shape.stroke()).toBe('#cc0000');
    expect(node.label.fill()).toBe('#660000');
  });

  it('hands a node back to the theme when its choice is cleared', () => {
    const node = makeNode('n1');
    node.setCustomColors({fill: '#ffcccc', stroke: '#cc0000', text: '#660000'});
    node.applyColors(dark);
    node.setCustomColors(null);
    expect(node.customColors).toBeNull();
    expect(node.shape.fill()).toBe('#222');
    expect(node.shape.stroke()).toBe('#ddd');
  });

  it('keeps a chosen border over the node kind\'s', () => {
    const node = makeNode('n1');
    node.setNodeKind({label: 'definition', color: '#888800'});
    node.setCustomColors({stroke: '#cc0000'});
    expect(node.shape.stroke()).toBe('#cc0000');
  });

  it('keeps a node\'s chosen colors through a change of shape', () => {
    const node = makeNode('n1');
    node.setCustomColors({fill: '#ccffcc', stroke: '#009900', text: '#004d00'});
    node.changeShape('circle', light);
    expect(node.shape.fill()).toBe('#ccffcc');
  });

  it('keeps an edge\'s chosen stroke through a theme change, over the direction colors', () => {
    const edge = new DAEdge(makeNode('a'), makeNode('b'), '', 'e1');
    edge.applyColors({stroke: 'black', fill: 'black'});
    edge.setDirectionColors({gradient: {from: '#111', to: '#999'}});
    edge.setCustomColors({stroke: '#0066cc', fill: '#0066cc'});
    edge.applyColors({stroke: '#ddd', fill: '#ddd'});
    expect(edge.line.stroke()).toBe('#0066cc');
    edge.setCustomColors(null);
    expect(edge.line.stroke()).not.toBe('#0066cc');
  });
});
