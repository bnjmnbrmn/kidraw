/**
 * Where a node is, in each of the two coordinate spaces.
 *
 * Small enough to inline, and it was inlined — which is how the drawing area
 * ended up with four spellings of the same idea. Naming the two spaces (see
 * camera.ts) only helps if the things measured in them are named too.
 */
import { Camera, Rect } from './camera';
import { DANode } from './da-node';
import { Point } from './utils';

/** The node's centre in layer units — where the graph says it is. */
export function nodeCenterInLayer(node: DANode): Point {
  return {
    x: node.group.x() + node.NODE_WIDTH / 2,
    y: node.group.y() + node.NODE_HEIGHT / 2,
  };
}

/** The node's centre in stage pixels — where it is on screen right now. */
export function nodeCenterInStage(node: DANode, camera: Camera): Point {
  return camera.toStage(nodeCenterInLayer(node));
}

/**
 * The node's box on screen, including any scaling its own group carries.
 *
 * The group scale matters: the nav popup enlarges its source node by scaling
 * that group, and a hit test against the unscaled box would miss the part the
 * user can see.
 */
export function nodeStageRect(node: DANode, camera: Camera): Rect {
  const corner = camera.toStage({x: node.group.x(), y: node.group.y()});
  return {
    x: corner.x,
    y: corner.y,
    width: camera.toStageDistance(node.NODE_WIDTH * node.group.scaleX()),
    height: camera.toStageDistance(node.NODE_HEIGHT * node.group.scaleY()),
  };
}
