import {fuzzyMatch} from './fuzzy-match';

describe('fuzzyMatch', () => {
  it('empty query matches everything with zero score', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({score: 0, positions: []});
  });

  it('requires the query to be an in-order subsequence', () => {
    expect(fuzzyMatch('vff', 'Vault fuzzy finder')).not.toBeNull();
    expect(fuzzyMatch('xq', 'Vault fuzzy finder')).toBeNull();
    expect(fuzzyMatch('rednif', 'finder')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('VAULT', 'vault fuzzy finder')).not.toBeNull();
    expect(fuzzyMatch('vault', 'VAULT FUZZY FINDER')).not.toBeNull();
  });

  it('scores consecutive runs above scattered matches', () => {
    const run = fuzzyMatch('find', 'Vault fuzzy finder')!;
    const scattered = fuzzyMatch('find', 'far in wind dune')!;
    expect(run.score).toBeGreaterThan(scattered.score);
  });

  it('prefers word starts (acronym matching)', () => {
    const m = fuzzyMatch('vff', 'Vault fuzzy finder')!;
    expect(m.positions).toEqual([0, 6, 12]);
  });

  it('reports positions for highlight rendering', () => {
    const m = fuzzyMatch('dep', 'depends-on')!;
    expect(m.positions).toEqual([0, 1, 2]);
  });
});
