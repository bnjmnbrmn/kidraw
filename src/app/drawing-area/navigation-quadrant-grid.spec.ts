import {
  adaptiveGoalAngleStep,
  adjustAngleTowardScreenVertical,
  distanceToGoalRay,
  moveUsesQuadrantConstraint,
  navigationQuadrant,
} from './navigation-quadrant-grid';

describe('adaptive quadrant navigation grid', () => {
  it('uses the origin diagonals to classify N/S/E/W regions', () => {
    expect(navigationQuadrant(100, 20)).toBe('east');
    expect(navigationQuadrant(-100, 20)).toBe('west');
    expect(navigationQuadrant(20, 100)).toBe('south');
    expect(navigationQuadrant(20, -100)).toBe('north');
    expect(navigationQuadrant(2, -3)).toBeNull();
  });

  it('constrains the main axis but leaves perpendicular movement free', () => {
    expect(moveUsesQuadrantConstraint('east', 'right')).toBeTrue();
    expect(moveUsesQuadrantConstraint('east', 'left')).toBeTrue();
    expect(moveUsesQuadrantConstraint('east', 'up')).toBeFalse();
    expect(moveUsesQuadrantConstraint('north', 'up')).toBeTrue();
    expect(moveUsesQuadrantConstraint('north', 'down')).toBeTrue();
    expect(moveUsesQuadrantConstraint('north', 'right')).toBeFalse();
  });

  it('steers n south and p north instead of assigning a fixed rotation', () => {
    const step = 10 * Math.PI / 180;
    const east = 0;
    const west = Math.PI;

    expect(adjustAngleTowardScreenVertical(east, 'south', step)).toBeCloseTo(step);
    expect(adjustAngleTowardScreenVertical(east, 'north', step)).toBeCloseTo(2 * Math.PI - step);
    expect(adjustAngleTowardScreenVertical(west, 'south', step)).toBeCloseTo(Math.PI - step);
    expect(adjustAngleTowardScreenVertical(west, 'north', step)).toBeCloseTo(Math.PI + step);
    expect(adjustAngleTowardScreenVertical(Math.PI / 2, 'south', step)).toBeCloseTo(Math.PI / 2);
    expect(adjustAngleTowardScreenVertical(Math.PI * 1.5, 'north', step)).toBeCloseTo(Math.PI * 1.5);
  });

  it('uses adaptive angle steps with a five-degree minimum', () => {
    const degrees = (radians: number) => radians * 180 / Math.PI;
    expect(degrees(adaptiveGoalAngleStep(1))).toBeCloseTo(15);
    expect(degrees(adaptiveGoalAngleStep(100))).toBeCloseTo(9);
    expect(degrees(adaptiveGoalAngleStep(10_000))).toBeCloseTo(5);
  });

  it('prefers stops close to the forward goal ray', () => {
    const origin = {x: 100, y: 100};
    expect(distanceToGoalRay(origin, 0, {cx: 200, cy: 110}))
      .toBeLessThan(distanceToGoalRay(origin, 0, {cx: 200, cy: 140}));
    expect(distanceToGoalRay(origin, 0, {cx: 0, cy: 100})).toBeGreaterThan(1_000_000);
  });
});
