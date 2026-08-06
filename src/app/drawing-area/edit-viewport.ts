export interface CaretScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pan needed to keep a text caret inside a comfortable viewport band.
 * Vertical breathing room is measured in rendered text lines; the cap keeps
 * small windows usable even when the text itself is very large. */
export function caretVisibilityPanDelta(
  caret: CaretScreenRect,
  viewport: {width: number; height: number},
  renderedLineHeight: number,
  contextLines = 3,
): {x: number; y: number} {
  const line = Math.max(renderedLineHeight, 1);
  const xMargin = Math.min(Math.max(36, line * 1.5), viewport.width * 0.35);
  const yMargin = Math.min(Math.max(36, line * contextLines), viewport.height * 0.4);
  const right = caret.x + Math.max(caret.width, 2);
  const bottom = caret.y + Math.max(caret.height, line);

  const axisDelta = (min: number, max: number, extent: number, margin: number) => {
    if (extent <= margin * 2) return extent / 2 - (min + max) / 2;
    if (min < margin) return margin - min;
    if (max > extent - margin) return extent - margin - max;
    return 0;
  };

  return {
    x: axisDelta(caret.x, right, viewport.width, xMargin),
    y: axisDelta(caret.y, bottom, viewport.height, yMargin),
  };
}
