import {navPopupRows, orderNavCandidates} from './nav-popup-model';

describe('nav popup model', () => {
  function candidate(id: string, direction: 'out' | 'in', x: number): any {
    return {
      edge: {id, labels: [], tags: []},
      other: {label: {text: () => id}, tags: [], x},
      direction,
    };
  }

  it('orders forward candidates before reverse candidates by bearing', () => {
    const east = candidate('east', 'out', 1);
    const west = candidate('west', 'out', -1);
    const reverse = candidate('reverse', 'in', 0);
    const ordered = orderNavCandidates([reverse, west, east], 'out', item => (item.other as any).x);
    expect(ordered.map(item => item.edge.id)).toEqual(['west', 'east', 'reverse']);
  });

  it('marks reverse-direction rows secondary when forward links exist', () => {
    const rows = navPopupRows([
      candidate('a', 'out', 0),
      candidate('b', 'in', 0),
    ], 'out');
    expect(rows.map(row => ({id: row.id, secondary: row.secondary, glyph: row.glyph})))
      .toEqual([
        {id: 'a', secondary: false, glyph: '→'},
        {id: 'b', secondary: true, glyph: '←'},
      ]);
  });
});
