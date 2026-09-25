import {DANode} from './da-node';
import {DAEdge} from './da-edge';
import {NavJourney} from './nav-journey';

describe('NavJourney', () => {
  let journey: NavJourney;

  beforeEach(() => journey = new NavJourney());

  it('takes its heading from the two node centers', () => {
    const a = new DANode(0, 0, 'a');
    const b = new DANode(300, 0, 'b');

    journey.arrive(a, b, 'out');

    expect(journey.momentum!.x).toBeCloseTo(1, 6);
    expect(journey.momentum!.y).toBeCloseTo(0, 6);
    expect(journey.direction).toBe('out');
    expect(journey.lastNodeAmong([a, b])).toBe(b);
  });

  it('keeps the old heading when the two nodes sit on each other', () => {
    const a = new DANode(0, 0, 'a');
    const b = new DANode(300, 0, 'b');
    const stacked = new DANode(300, 0, 'stacked');
    journey.arrive(a, b, 'out');

    journey.arrive(b, stacked, 'in');

    // No usable direction from a zero-length hop, so the last one stands.
    expect(journey.momentum!.x).toBeCloseTo(1, 6);
    expect(journey.direction).toBe('in');
  });

  it('forgets a last node that has left the graph', () => {
    const a = new DANode(0, 0, 'a');
    const b = new DANode(300, 0, 'b');
    journey.arrive(a, b, 'out');

    expect(journey.lastNodeAmong([a])).toBeNull();
    expect(journey.lastNodeAmong([a, b])).toBeNull();
  });

  it('focuses one edge at a time and reports only real changes', () => {
    const a = new DANode(0, 0, 'a');
    const b = new DANode(300, 0, 'b');
    const first = new DAEdge(a, b, '');
    const second = new DAEdge(b, a, '');

    expect(journey.focusEdge(first)).toBeTrue();
    expect(journey.focusEdge(first)).toBeFalse();
    expect(first.navFocused).toBeTrue();

    expect(journey.focusEdge(second)).toBeTrue();
    expect(first.navFocused).toBeFalse();
    expect(second.navFocused).toBeTrue();

    expect(journey.focusEdge(null)).toBeTrue();
    expect(second.navFocused).toBeFalse();
  });

  it('drops the direction when the walk resumes somewhere else', () => {
    const a = new DANode(0, 0, 'a');
    const b = new DANode(300, 0, 'b');
    const elsewhere = new DANode(900, 0, 'elsewhere');
    journey.arrive(a, b, 'out');

    journey.coldStartUnlessAt(b);
    expect(journey.direction).toBe('out');

    journey.coldStartUnlessAt(elsewhere);
    expect(journey.direction).toBeNull();
  });

  describe('jumplist', () => {
    const nodes = new Map<string, DANode>();
    let a: DANode, b: DANode, c: DANode;
    const byId = (id: string) => nodes.get(id);

    beforeEach(() => {
      a = new DANode(0, 0, 'a');
      b = new DANode(300, 0, 'b');
      c = new DANode(600, 0, 'c');
      nodes.clear();
      for (const n of [a, b, c]) nodes.set(n.id, n);
      journey.arrive(a, b, 'out');
      journey.arrive(b, c, 'out');
    });

    it('steps back through the visited nodes and forward again', () => {
      expect(journey.stepHistory(-1, byId)).toBe(b);
      expect(journey.stepHistory(-1, byId)).toBe(a);
      expect(journey.stepHistory(1, byId)).toBe(b);
      expect(journey.stepHistory(1, byId)).toBe(c);
    });

    it('returns null rather than moving when the list runs out', () => {
      journey.stepHistory(-1, byId);
      journey.stepHistory(-1, byId);

      expect(journey.stepHistory(-1, byId)).toBeNull();
      // The cursor did not move, so forward still works.
      expect(journey.stepHistory(1, byId)).toBe(b);
    });

    it('skips entries whose nodes have since been deleted', () => {
      nodes.delete(b.id);

      expect(journey.stepHistory(-1, byId)).toBe(a);
    });

    it('arrives cold: no direction, nothing focused', () => {
      const edge = new DAEdge(a, b, '');
      journey.focusEdge(edge);

      journey.stepHistory(-1, byId);

      expect(journey.direction).toBeNull();
      expect(journey.focusedEdge).toBeNull();
      expect(edge.navFocused).toBeFalse();
    });

    it('truncates the forward entries when a new jump is made', () => {
      journey.stepHistory(-1, byId);   // at b, with c ahead
      journey.arrive(b, a, 'in');      // a new jump discards c

      expect(journey.stepHistory(1, byId)).toBeNull();
      expect(journey.stepHistory(-1, byId)).toBe(b);
    });
  });
});
