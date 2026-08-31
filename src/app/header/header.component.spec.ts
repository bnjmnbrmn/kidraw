import {sampleGraphsEnabled} from './header.component';

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
