import { StyleController, StyleHost } from './style-controller';

/** Shape toggling, colour and the direction cycle are covered through the
 *  component, where their targeting lives (drawing-area.component.*.spec.ts). */
describe('StyleController', () => {
  it('gives new nodes the shape you chose, else the diagram type\'s, else a box', () => {
    let typeShape: string | undefined;
    const style = new StyleController({
      typeNodeShape: () => typeShape, targetNodes: () => [], emitStatus: () => undefined,
    } as unknown as StyleHost);
    expect(style.effectiveNodeShape()).toBe('box');
    typeShape = 'circle';
    expect(style.effectiveNodeShape()).toBe('circle');
    style.setNodeShape('box');
    expect(style.defaults.nodeShape).toBe('box');
    expect(style.effectiveNodeShape()).toBe('box');
  });
});
