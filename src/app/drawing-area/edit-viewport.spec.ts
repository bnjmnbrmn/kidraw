import {caretVisibilityPanDelta} from './edit-viewport';

describe('caretVisibilityPanDelta', () => {
  const viewport = {width: 800, height: 500};

  it('does not pan while the caret has three lines of vertical context', () => {
    expect(caretVisibilityPanDelta(
      {x: 300, y: 180, width: 2, height: 20}, viewport, 20,
    )).toEqual({x: 0, y: 0});
  });

  it('pans down to restore context above a caret near the top', () => {
    expect(caretVisibilityPanDelta(
      {x: 300, y: 10, width: 2, height: 20}, viewport, 20,
    ).y).toBe(50);
  });

  it('pans up to restore context below a caret near the bottom', () => {
    expect(caretVisibilityPanDelta(
      {x: 300, y: 480, width: 2, height: 20}, viewport, 20,
    ).y).toBe(-60);
  });

  it('also keeps a wide character cursor inside the horizontal viewport', () => {
    expect(caretVisibilityPanDelta(
      {x: 790, y: 200, width: 18, height: 20}, viewport, 20,
    ).x).toBe(-44);
  });
});
