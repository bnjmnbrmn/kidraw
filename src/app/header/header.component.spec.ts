import {headerFileIdentity, sampleGraphsEnabled} from './header.component';

describe('header development affordances', () => {
  it('keeps sample graphs hidden on ordinary URLs', () => {
    expect(sampleGraphsEnabled('')).toBeFalse();
    expect(sampleGraphsEnabled('?demo=true')).toBeFalse();
    expect(sampleGraphsEnabled('?samples=false')).toBeFalse();
  });

  it('shows sample graphs only when the URL explicitly opts in', () => {
    expect(sampleGraphsEnabled('?samples=1')).toBeTrue();
    expect(sampleGraphsEnabled('?samples=true')).toBeTrue();
    expect(sampleGraphsEnabled('?samples')).toBeTrue();
  });
});

describe('header file identity', () => {
  it('names an unbacked graph without inventing a vault', () => {
    expect(headerFileIdentity(null)).toEqual({vaultName: null, path: 'Untitled'});
  });

  it('keeps an external file separate from vault identity', () => {
    expect(headerFileIdentity({storage: 'external', path: 'picked.kidraw.yaml'}))
      .toEqual({vaultName: null, path: 'picked.kidraw.yaml'});
  });

  it('preserves the vault name and complete in-vault path as separate values', () => {
    expect(headerFileIdentity({
      storage: 'vault',
      vaultName: 'diagrams',
      path: 'diagrams/archive/example.kidraw.yaml',
    })).toEqual({
      vaultName: 'diagrams',
      path: 'diagrams/archive/example.kidraw.yaml',
    });
  });
});
