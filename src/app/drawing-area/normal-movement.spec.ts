import {
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
