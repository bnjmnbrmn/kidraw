import {placePopup, popupSize} from './nav-popup-layout';

describe('nav popup layout', () => {
  const viewport = {minX: 10, maxX: 810, minY: 20, maxY: 620};

  it('uses the popup metrics and caps tall lists', () => {
    expect(popupSize(2)).toEqual({width: 210, height: 110});
    expect(popupSize(20)).toEqual({width: 210, height: 220});
  });

  it('places to the requested side with the standard gap', () => {
    const anchor = {x: 300, y: 200, w: 120};
    expect(placePopup(anchor, viewport, popupSize(2), 'left'))
      .toEqual({left: 76, top: 200});
    expect(placePopup(anchor, viewport, popupSize(2), 'right'))
      .toEqual({left: 434, top: 200});
  });

  it('clamps both axes inside the usable viewport', () => {
    const anchor = {x: 0, y: 0, w: 20};
    expect(placePopup(anchor, viewport, popupSize(20), 'left'))
      .toEqual({left: 18, top: 28});

    const low = {x: 790, y: 610, w: 20};
    expect(placePopup(low, viewport, popupSize(20), 'right'))
      .toEqual({left: 592, top: 392});
  });
});
