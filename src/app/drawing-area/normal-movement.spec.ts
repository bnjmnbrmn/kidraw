import {
  gridSnapStepper,
  nextNormalMovementStep,
  startNormalMovementGoal,
} from './normal-movement';

describe('normal movement goal line', () => {
  it('advances by the configured distance on its fixed axis', () => {
    const first = nextNormalMovementStep(
      startNormalMovementGoal('x', {x: 10, y: 25}),
      1,
      50,
    );
    expect(first.target).toEqual({x: 60, y: 25});

    const second = nextNormalMovementStep(first.state, 1, 50);
    expect(second.target).toEqual({x: 110, y: 25});
  });

  it('reverses by the same distance without leaving the goal line', () => {
    const first = nextNormalMovementStep(
      startNormalMovementGoal('y', {x: 40, y: 100}),
      -1,
      20,
    );
    expect(first.target).toEqual({x: 40, y: 80});

    const reversed = nextNormalMovementStep(first.state, 1, 20);
    expect(reversed.target).toEqual({x: 40, y: 100});
  });
});

describe('gridSnapStepper', () => {
  const step = gridSnapStepper(50);

  it('leaves the coordinate alone when the axis was not pressed', () => {
    expect(step(137, 0)).toBe(137);
  });

  it('snaps to the nearest line, then steps one cell', () => {
    expect(step(137, 1)).toBe(200);   // nearest is 150, +50
    expect(step(137, -1)).toBe(100);  // nearest is 150, -50
  });

  it('steps off an exact grid line rather than standing still', () => {
    expect(step(150, 1)).toBe(200);
    expect(step(150, -1)).toBe(100);
  });

  it('reads only the sign of the delta', () => {
    expect(step(137, 9)).toBe(step(137, 1));
    expect(step(137, -9)).toBe(step(137, -1));
  });

  it('works on a sub-grid spacing', () => {
    expect(gridSnapStepper(10)(137, 1)).toBe(150);
  });
});
