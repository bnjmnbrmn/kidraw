import {
  nextNormalMovementStep,
  NormalMovementSnapCandidate,
  startNormalMovementGoal,
} from './normal-movement';

describe('normal movement goal line', () => {
  it('snaps off-line, returns perpendicularly, then continues along the line', () => {
    const nearbyNode: NormalMovementSnapCandidate = {
      id: 'node:a',
      point: {x: 30, y: 12},
      priority: 0,
      distance: 12,
    };
    let state = startNormalMovementGoal('x', {x: 0, y: 0});

    const snap = nextNormalMovementStep(state, 1, 50, [nearbyNode]);
    expect(snap.kind).toBe('snap');
    expect(snap.target).toEqual({x: 30, y: 12});

    state = snap.state;
    const back = nextNormalMovementStep(state, 1, 50, [nearbyNode]);
    expect(back.kind).toBe('return');
    expect(back.target).toEqual({x: 30, y: 0});

    const onward = nextNormalMovementStep(back.state, 1, 50, [nearbyNode]);
    expect(onward.kind).toBe('line');
    expect(onward.target).toEqual({x: 80, y: 0});
  });

  it('visits every eligible feature in progress order without resnapping', () => {
    const candidates: NormalMovementSnapCandidate[] = [
      {id: 'label:b', point: {x: 45, y: 0}, priority: 2, distance: 0},
      {id: 'waypoint:a', point: {x: 20, y: 0}, priority: 1, distance: 0},
    ];
    let state = startNormalMovementGoal('x', {x: 0, y: 0});

    const first = nextNormalMovementStep(state, 1, 50, candidates);
    expect(first.snappedId).toBe('waypoint:a');

    state = first.state;
    const second = nextNormalMovementStep(state, 1, 50, candidates);
    expect(second.snappedId).toBe('label:b');

    const third = nextNormalMovementStep(second.state, 1, 50, candidates);
    expect(third.kind).toBe('line');
    expect(third.target.x).toBe(95);
  });

  it('allows features to be visited again after reversing direction', () => {
    const candidate: NormalMovementSnapCandidate = {
      id: 'node:a',
      point: {x: 20, y: 0},
      priority: 0,
      distance: 0,
    };
    let state = startNormalMovementGoal('x', {x: 0, y: 0});
    state = nextNormalMovementStep(state, 1, 50, [candidate]).state;
    state = nextNormalMovementStep(state, 1, 50, [candidate]).state;

    const reversed = nextNormalMovementStep(state, -1, 50, [candidate]);
    expect(reversed.kind).toBe('snap');
    expect(reversed.snappedId).toBe('node:a');
  });

  it('does not rediscover the same side after alternating at a boundary', () => {
    const candidate: NormalMovementSnapCandidate = {
      id: 'node:a',
      point: {x: 20, y: 0},
      priority: 0,
      distance: 0,
    };
    let state = startNormalMovementGoal('x', {x: 0, y: 0});

    const firstForward = nextNormalMovementStep(state, 1, 50, [candidate]);
    expect(firstForward.snappedId).toBe('node:a');

    state = nextNormalMovementStep(firstForward.state, -1, 50, [candidate]).state;
    const secondForward = nextNormalMovementStep(state, 1, 50, [candidate]);

    expect(secondForward.kind).toBe('line');
    expect(secondForward.snappedId).toBeUndefined();
  });

  it('stops at an item boundary when the goal line passes through it', () => {
    const crossingNode: NormalMovementSnapCandidate = {
      id: 'node:a',
      point: {x: 60, y: 0},
      crossingSpan: {min: 40, max: 80},
      priority: 0,
      distance: 0,
    };

    const entering = nextNormalMovementStep(
      startNormalMovementGoal('x', {x: 0, y: 0}),
      1,
      100,
      [crossingNode],
    );

    expect(entering.kind).toBe('snap');
    expect(entering.target).toEqual({x: 40, y: 0});
    expect(entering.state.pendingReturn).toBeUndefined();
  });

  it('uses the exit boundary when movement starts inside a crossing item', () => {
    const crossingLabel: NormalMovementSnapCandidate = {
      id: 'label:a',
      point: {x: 60, y: 0},
      crossingSpan: {min: 40, max: 80},
      priority: 2,
      distance: 0,
    };

    const exiting = nextNormalMovementStep(
      startNormalMovementGoal('x', {x: 50, y: 0}),
      1,
      100,
      [crossingLabel],
    );

    expect(exiting.target).toEqual({x: 80, y: 0});
  });

  it('uses feature priority to disambiguate a waypoint on an edge', () => {
    const candidates: NormalMovementSnapCandidate[] = [
      {id: 'edge:a', point: {x: 30, y: 0}, priority: 3, distance: 0},
      {id: 'waypoint:a', point: {x: 30, y: 0}, priority: 1, distance: 0},
    ];

    const step = nextNormalMovementStep(
      startNormalMovementGoal('x', {x: 0, y: 0}),
      1,
      50,
      candidates,
    );

    expect(step.snappedId).toBe('waypoint:a');
  });
});
