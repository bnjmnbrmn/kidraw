import {Camera, CameraLayer} from './camera';
import {DANode} from './da-node';
import {nodeCenterInLayer, nodeCenterInStage, nodeStageRect} from './node-geometry';

const camera = (x: number, y: number, scale: number) =>
  new Camera(() => ({x: () => x, y: () => y, scaleX: () => scale} as CameraLayer));

describe('node geometry', () => {
  it('centres a node in layer units from its corner and size', () => {
    const node = new DANode(100, 200, '');
    expect(nodeCenterInLayer(node))
      .toEqual({x: 100 + node.NODE_WIDTH / 2, y: 200 + node.NODE_HEIGHT / 2});
  });

  it('centres a node in stage pixels through the camera', () => {
    const node = new DANode(100, 200, '');
    const layerCentre = nodeCenterInLayer(node);
    expect(nodeCenterInStage(node, camera(30, -10, 2)))
      .toEqual({x: layerCentre.x * 2 + 30, y: layerCentre.y * 2 - 10});
  });

  it('puts the stage rect at the node corner, scaled by the zoom', () => {
    const node = new DANode(100, 200, '');
    const rect = nodeStageRect(node, camera(0, 0, 2));
    expect(rect.x).toBe(200);
    expect(rect.y).toBe(400);
    expect(rect.width).toBe(node.NODE_WIDTH * 2);
    expect(rect.height).toBe(node.NODE_HEIGHT * 2);
  });

  it("includes the node group's own scale, which the nav popup uses", () => {
    const node = new DANode(0, 0, '');
    node.group.scaleX(3);
    node.group.scaleY(3);
    const rect = nodeStageRect(node, camera(0, 0, 1));
    expect(rect.width).toBe(node.NODE_WIDTH * 3);
    expect(rect.height).toBe(node.NODE_HEIGHT * 3);
  });
});
