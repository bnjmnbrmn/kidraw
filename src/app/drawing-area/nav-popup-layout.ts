/** Screen-space rectangle occupied by the node beside which a popup sits. */
export interface PopupAnchorRect {
  x: number;
  y: number;
  w: number;
}

export interface PopupViewport {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PopupSize {
  width: number;
  height: number;
}

export interface PopupPosition {
  left: number;
  top: number;
}

const POPUP_WIDTH = 210;
const POPUP_MAX_HEIGHT = 220;
const POPUP_EDGE_INSET = 8;
const POPUP_GAP = 14;

/** Keep this estimate in step with nav-popup.component.css row metrics. */
export function popupSize(rowCount: number): PopupSize {
  return {width: POPUP_WIDTH, height: Math.min(38 + rowCount * 28 + 16, POPUP_MAX_HEIGHT)};
}

/** Place beside an anchor and clamp the result to the usable viewport. */
export function placePopup(
  anchor: PopupAnchorRect,
  viewport: PopupViewport,
  size: PopupSize,
  side: 'left' | 'right',
): PopupPosition {
  const preferredLeft = side === 'left'
    ? anchor.x - POPUP_GAP - size.width
    : anchor.x + anchor.w + POPUP_GAP;
  return {
    left: clamp(preferredLeft, viewport.minX + POPUP_EDGE_INSET,
      viewport.maxX - size.width - POPUP_EDGE_INSET),
    top: clamp(anchor.y, viewport.minY + POPUP_EDGE_INSET,
      viewport.maxY - size.height - POPUP_EDGE_INSET),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
