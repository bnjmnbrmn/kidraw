import {GrowPlacement, GrowPlacementHost} from './grow-placement';

describe('GrowPlacement', () => {
  function build(anchor: unknown = null): {
    placement: GrowPlacement;
    host: GrowPlacementHost & {redraw: jasmine.Spy; origin: {x: number; y: number}};
  } {
    const host = {
      anchor: anchor as GrowPlacementHost['anchor'],
      origin: {x: 0, y: 0},
      spacing: (axis: 'x' | 'y') => axis === 'x' ? 180 : 137,
      coarseModifierHeld: () => false,
      fineModifierHeld: () => false,
      redraw: jasmine.createSpy('redraw'),
    };
    return {placement: new GrowPlacement(host), host};
  }

  it('starts beside an anchor, or at the origin on empty canvas', () => {
    const anchored = build({});
    anchored.placement.enter('circle');
    expect(anchored.placement.position).toEqual({x: 180, y: 0});
    expect(anchored.placement.shape).toBe('circle');

    const empty = build();
    empty.host.origin = {x: 12, y: 24};
    empty.placement.enter('box');
    expect(empty.placement.position).toEqual({x: 12, y: 24});
  });

  it('throws the first move by the full axis spacing', () => {
    const {placement, host} = build({});
    placement.enter('box');
    placement.move('down');
    expect(placement.position).toEqual({x: 0, y: 137});
    expect(host.redraw).toHaveBeenCalledOnceWith();
  });

  it('uses the default grid step after the rough throw', () => {
    const {placement} = build({});
    placement.enter('box');
    placement.move('right');
    placement.move('right');
    expect(placement.position).toEqual({x: 230, y: 0});
  });

  it('uses axis spacing for the coarse modifier and ten for fine', () => {
    const coarse = build({});
    coarse.placement.enter('box');
    coarse.placement.move('down');
    coarse.placement.addModifier('coarse');
    coarse.placement.move('down');
    expect(coarse.placement.position).toEqual({x: 0, y: 274});

    const fine = build({});
    fine.placement.enter('box');
    fine.placement.move('down');
    fine.placement.addModifier('fine');
    fine.placement.move('down');
    expect(fine.placement.position).toEqual({x: 0, y: 147});
  });

  it('removes modifiers when their keys are released', () => {
    const {placement} = build({});
    placement.addModifier('fine');
    placement.removeModifier('fine');
    expect(placement.modifiers.has('fine')).toBeFalse();
  });
});
