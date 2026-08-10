import {
  anchorPosition,
  centeredBoxClearsRects,
  cycleSide,
  directionalLabelAnchorStep,
  LABEL_T_MAX,
  LABEL_T_MIN,
  nextTStop,
  pathLength,
  pointAtT,
  projectPointToPath,
  sideFromSignedDist,
} from './edge-label-anchor';

describe('edge-label-anchor', () => {
  const horizontal = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const bent = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]; // total 200

  describe('pathLength', () => {
    it('sums segment lengths', () => {
      expect(pathLength(horizontal)).toBe(100);
      expect(pathLength(bent)).toBe(200);
    });
  });

  describe('pointAtT', () => {
    it('interpolates along a single segment', () => {
      const p = pointAtT(horizontal, 0.25)!;
      expect(p.x).toBeCloseTo(25);
      expect(p.y).toBeCloseTo(0);
    });

    it('walks across segments by arc length', () => {
      const p = pointAtT(bent, 0.75)!; // 150 along: 50 into the vertical leg
      expect(p.x).toBeCloseTo(100);
      expect(p.y).toBeCloseTo(50);
    });

    it('clamps t outside [0, 1]', () => {
      expect(pointAtT(horizontal, -1)!.x).toBeCloseTo(0);
      expect(pointAtT(horizontal, 2)!.x).toBeCloseTo(100);
    });

    it('returns a screen-up normal regardless of travel direction', () => {
      const ltr = pointAtT([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0.5)!;
      const rtl = pointAtT([{ x: 100, y: 0 }, { x: 0, y: 0 }], 0.5)!;
      expect(ltr.ny).toBeLessThan(0);
      expect(rtl.ny).toBeLessThan(0);
      expect(ltr.nx).toBeCloseTo(rtl.nx);
    });

    it('degrades to the +x normal on vertical segments, direction-independent', () => {
      const down = pointAtT([{ x: 0, y: 0 }, { x: 0, y: 100 }], 0.5)!;
      const up = pointAtT([{ x: 0, y: 100 }, { x: 0, y: 0 }], 0.5)!;
      expect(down.nx).toBeCloseTo(1);
      expect(up.nx).toBeCloseTo(1);
    });

    it('rejects degenerate paths', () => {
      expect(pointAtT([{ x: 5, y: 5 }], 0.5)).toBeNull();
      expect(pointAtT([{ x: 5, y: 5 }, { x: 5, y: 5 }], 0.5)).toBeNull();
    });
  });

  describe('projectPointToPath', () => {
    it('projects onto the nearest segment with arc-length t', () => {
      const r = projectPointToPath(bent, { x: 100, y: 50 })!; // on the vertical leg
      expect(r.t).toBeCloseTo(0.75);
      expect(Math.abs(r.signedDist)).toBeCloseTo(0);
    });

    it('reports signed distance positive on the above side', () => {
      const above = projectPointToPath(horizontal, { x: 50, y: -20 })!;
      const below = projectPointToPath(horizontal, { x: 50, y: 20 })!;
      expect(above.signedDist).toBeCloseTo(20);
      expect(below.signedDist).toBeCloseTo(-20);
    });

    it('round-trips with pointAtT', () => {
      const p = pointAtT(bent, 0.3)!;
      const r = projectPointToPath(bent, p)!;
      expect(r.t).toBeCloseTo(0.3);
    });
  });

  describe('sideFromSignedDist', () => {
    it('maps distance to side with an on-threshold', () => {
      expect(sideFromSignedDist(20, 10)).toBe('above');
      expect(sideFromSignedDist(-20, 10)).toBe('below');
      expect(sideFromSignedDist(5, 10)).toBe('on');
      expect(sideFromSignedDist(-5, 10)).toBe('on');
    });
  });

  describe('anchorPosition', () => {
    it('offsets perpendicular by side', () => {
      const on = anchorPosition(horizontal, 0.5, 'on', 19)!;
      const above = anchorPosition(horizontal, 0.5, 'above', 19)!;
      const below = anchorPosition(horizontal, 0.5, 'below', 19)!;
      expect(on.y).toBeCloseTo(0);
      expect(above.y).toBeCloseTo(-19);
      expect(below.y).toBeCloseTo(19);
      expect(on.x).toBeCloseTo(50);
      expect(above.x).toBeCloseTo(50);
    });
  });

  describe('centeredBoxClearsRects', () => {
    const endpoint = {x: 0, y: -50, width: 100, height: 100};

    it('accepts a label box that clears the padded endpoint', () => {
      expect(centeredBoxClearsRects(
        {x: 145, y: 0}, {width: 80, height: 30}, [endpoint], 4,
      )).toBeTrue();
    });

    it('rejects a label box that would tuck behind the endpoint', () => {
      expect(centeredBoxClearsRects(
        {x: 140, y: 0}, {width: 80, height: 30}, [endpoint], 4,
      )).toBeFalse();
    });
  });

  describe('nextTStop', () => {
    it('advances between start / middle / end stops', () => {
      expect(nextTStop(0.1, 1)).toBe(0.5);
      expect(nextTStop(0.5, 1)).toBe(0.9);
      expect(nextTStop(0.5, -1)).toBe(0.1);
      expect(nextTStop(0.9, -1)).toBe(0.5);
    });

    it('snaps an off-stop t to the next stop in the direction', () => {
      expect(nextTStop(0.3, 1)).toBe(0.5);
      expect(nextTStop(0.3, -1)).toBe(0.1);
    });

    it('saturates at the outer stops', () => {
      expect(nextTStop(LABEL_T_MAX, 1)).toBe(LABEL_T_MAX);
      expect(nextTStop(LABEL_T_MIN, -1)).toBe(LABEL_T_MIN);
    });
  });

  describe('cycleSide', () => {
    it('steps above → on → below and saturates', () => {
      expect(cycleSide('above', 1)).toBe('on');
      expect(cycleSide('on', 1)).toBe('below');
      expect(cycleSide('below', 1)).toBe('below');
      expect(cycleSide('below', -1)).toBe('on');
      expect(cycleSide('on', -1)).toBe('above');
      expect(cycleSide('above', -1)).toBe('above');
    });
  });

  describe('directionalLabelAnchorStep', () => {
    it('moves left on screen even when the edge runs right-to-left', () => {
      const rightToLeft = [{x: 100, y: 0}, {x: 0, y: 0}];
      const step = directionalLabelAnchorStep(
        rightToLeft, 0.5, 'on', 20, {x: -1, y: 0}, 20,
      )!;
      const before = anchorPosition(rightToLeft, 0.5, 'on', 20)!;
      const after = anchorPosition(rightToLeft, step.t, step.side, 20)!;

      expect(after.x).toBeLessThan(before.x);
      expect(step.t).toBeGreaterThan(0.5);
    });

    it('moves to the left side instead of along a vertical edge', () => {
      const vertical = [{x: 0, y: 0}, {x: 0, y: 100}];
      const step = directionalLabelAnchorStep(
        vertical, 0.5, 'on', 20, {x: -1, y: 0}, 20,
      )!;
      const after = anchorPosition(vertical, step.t, step.side, 20)!;

      expect(step.t).toBe(0.5);
      expect(step.side).toBe('below');
      expect(after.x).toBeLessThan(0);
    });

    it('moves through on-edge instead of skipping between outer sides', () => {
      const step = directionalLabelAnchorStep(
        horizontal, 0.5, 'above', 20, {x: 0, y: 1}, 20,
      )!;

      expect(step.t).toBe(0.5);
      expect(step.side).toBe('on');
    });

    it('can return to a diagonal edge even when along-path movement is longer', () => {
      const diagonal = [{x: 0, y: 0}, {x: 100, y: 100}];
      const step = directionalLabelAnchorStep(
        diagonal, 0.5, 'above', 20, {x: 0, y: 1}, 100,
      )!;

      expect(step.t).toBe(0.5);
      expect(step.side).toBe('on');
    });

    it('no-ops rather than moving opposite the requested direction', () => {
      expect(directionalLabelAnchorStep(
        horizontal, LABEL_T_MIN, 'on', 20, {x: -1, y: 0}, 20,
      )).toBeNull();
    });

    it('no-ops before a drag can put the label behind an endpoint node', () => {
      const betweenFaces = [{x: 100, y: 0}, {x: 500, y: 0}];
      const step = directionalLabelAnchorStep(
        betweenFaces,
        0.25,
        'on',
        20,
        {x: -1, y: 0},
        60,
        {
          labelSize: {width: 80, height: 30},
          keepOutRects: [
            {x: 0, y: -50, width: 100, height: 100},
            {x: 500, y: -50, width: 100, height: 100},
          ],
          keepOutPadding: 4,
        },
      );

      expect(step).toBeNull();
    });
  });
});
