import {
  ImportResolver,
  resolveAndApplyToGraph,
  resolveStyleCascade,
} from './resolver';
import { KidrawGraphDoc, KidrawStyleSet } from './types';

function loaderFrom(files: { [path: string]: KidrawStyleSet }): ImportResolver {
  return (path: string) => files[path] ?? null;
}

describe('resolver — resolveStyleCascade', () => {
  it('returns an empty style when root has no rules and no imports', () => {
    const result = resolveStyleCascade({ kdStyle: 1 }, () => null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ kdStyle: 1 });
  });

  it('carries root rules through when there are no imports', () => {
    const root: KidrawStyleSet = {
      kdStyle: 1,
      tagStyles: { backend: { fill: '#blue' } },
      nodes: { n1: { x: 10 } },
    };
    const result = resolveStyleCascade(root, () => null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tagStyles?.['backend']).toEqual({ fill: '#blue' });
      expect(result.value.nodes?.['n1']).toEqual({ x: 10 });
    }
  });

  it('imports are applied before own rules — root wins on conflicts', () => {
    const base: KidrawStyleSet = {
      kdStyle: 1,
      nodes: { n1: { x: 100, y: 200, fontSize: 12 } },
    };
    const root: KidrawStyleSet = {
      kdStyle: 1,
      imports: ['./base.kd-style.json'],
      nodes: { n1: { x: 999, fontSize: 18 } }, // overrides x + fontSize, keeps y
    };
    const result = resolveStyleCascade(root, loaderFrom({ './base.kd-style.json': base }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes?.['n1']).toEqual({ x: 999, y: 200, fontSize: 18 });
    }
  });

  it('linear import chain — outermost wins on shared keys', () => {
    const c: KidrawStyleSet = { kdStyle: 1, tagStyles: { x: { fill: 'C' } } };
    const b: KidrawStyleSet = { kdStyle: 1, imports: ['./c'], tagStyles: { x: { fill: 'B' } } };
    const a: KidrawStyleSet = { kdStyle: 1, imports: ['./b'], tagStyles: { x: { fill: 'A' } } };
    const result = resolveStyleCascade(a, loaderFrom({ './b': b, './c': c }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tagStyles?.['x']).toEqual({ fill: 'A' });
  });

  it('diamond import — shared dependency is loaded once', () => {
    let dLoadCount = 0;
    const d: KidrawStyleSet = { kdStyle: 1, tagStyles: { shared: { stroke: 'D' } } };
    const b: KidrawStyleSet = { kdStyle: 1, imports: ['./d'] };
    const c: KidrawStyleSet = { kdStyle: 1, imports: ['./d'] };
    const a: KidrawStyleSet = { kdStyle: 1, imports: ['./b', './c'] };
    const resolver: ImportResolver = (path) => {
      if (path === './d') { dLoadCount++; return d; }
      if (path === './b') return b;
      if (path === './c') return c;
      return null;
    };
    const result = resolveStyleCascade(a, resolver);
    expect(result.ok).toBe(true);
    expect(dLoadCount).toBe(1);
    if (result.ok) expect(result.value.tagStyles?.['shared']).toEqual({ stroke: 'D' });
  });

  it('rejects a direct import cycle (A → A)', () => {
    const a: KidrawStyleSet = { kdStyle: 1, imports: ['./a'] };
    const result = resolveStyleCascade(a, loaderFrom({ './a': a }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain('cycle');
  });

  it('rejects an indirect import cycle (A → B → A)', () => {
    const aPath = './a';
    const bPath = './b';
    const a: KidrawStyleSet = { kdStyle: 1, imports: [bPath] };
    const b: KidrawStyleSet = { kdStyle: 1, imports: [aPath] };
    const resolver = loaderFrom({ [aPath]: a, [bPath]: b });
    // Walk from b — b imports a imports b → cycle.
    const result = resolveStyleCascade(b, resolver);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain('cycle');
  });

  it('errors when an import cannot be resolved', () => {
    const a: KidrawStyleSet = { kdStyle: 1, imports: ['./missing'] };
    const result = resolveStyleCascade(a, () => null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('missing');
  });

  it('merges nodes, edges, and tagStyles per-id/-tag', () => {
    const imp: KidrawStyleSet = {
      kdStyle: 1,
      nodes: { a: { x: 1, y: 2 }, b: { x: 10 } },
      edges: { e1: { lineStyle: 'solid' } },
      tagStyles: { t1: { fill: '#red' }, t2: { stroke: 'green' } },
    };
    const root: KidrawStyleSet = {
      kdStyle: 1,
      imports: ['./imp'],
      nodes: { a: { x: 99 } },                 // overrides a.x; keeps a.y
      tagStyles: { t1: { stroke: '#bold' } },  // augments t1 without removing fill
    };
    const result = resolveStyleCascade(root, loaderFrom({ './imp': imp }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes?.['a']).toEqual({ x: 99, y: 2 });
      expect(result.value.nodes?.['b']).toEqual({ x: 10 });
      expect(result.value.edges?.['e1']).toEqual({ lineStyle: 'solid' });
      expect(result.value.tagStyles?.['t1']).toEqual({ fill: '#red', stroke: '#bold' });
      expect(result.value.tagStyles?.['t2']).toEqual({ stroke: 'green' });
    }
  });

  it('view: top-level view replaces any imported view', () => {
    const imp: KidrawStyleSet = { kdStyle: 1, view: { zoom: 0.5, panX: 0, panY: 0 } };
    const root: KidrawStyleSet = {
      kdStyle: 1,
      imports: ['./imp'],
      view: { zoom: 2.0, panX: 10, panY: 20 },
    };
    const result = resolveStyleCascade(root, loaderFrom({ './imp': imp }));
    if (result.ok) expect(result.value.view).toEqual({ zoom: 2.0, panX: 10, panY: 20 });
  });

  it('accepts an inline style set as the root', () => {
    const result = resolveStyleCascade(
      { name: 'inline-root', nodes: { x: { x: 5 } } },
      () => null,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.nodes?.['x']).toEqual({ x: 5 });
  });
});

describe('resolver — resolveAndApplyToGraph (tag flattening)', () => {
  const graph: KidrawGraphDoc = {
    kidraw: 1,
    styles: [],
    semantics: {
      nodes: {
        'auth':    { label: 'Auth',    tags: ['backend', 'critical'] },
        'web':     { label: 'Web',     tags: ['frontend'] },
        'no-tags': { label: 'Lonely' },
      },
      edges: {
        'e1': { from: 'auth', to: 'web', tags: ['read-path'] },
      },
    },
  };

  const style: KidrawStyleSet = {
    kdStyle: 1,
    tagStyles: {
      backend:  { fill: '#blue', stroke: '#navy' },
      critical: { stroke: '#red', strokeWidth: 2 },
      'read-path': { lineStyle: 'dashed' },
    },
    nodes: { 'auth': { fontSize: 18 } }, // per-element override on auth
  };

  it('flattens tagStyles into per-element rules using node tags', () => {
    const result = resolveAndApplyToGraph(graph, style, () => null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 'auth' has tags [backend, critical], applied in declared order,
    // then the per-element rule overrides.
    // backend gives fill=#blue, stroke=#navy
    // critical overrides stroke to #red and adds strokeWidth
    // nodes.auth overrides fontSize=18
    expect(result.value.nodes?.['auth']).toEqual({
      fill: '#blue',
      stroke: '#red',
      strokeWidth: 2,
      fontSize: 18,
    });
  });

  it('drops nodes with no applicable rules', () => {
    const result = resolveAndApplyToGraph(graph, style, () => null);
    if (result.ok) expect(result.value.nodes?.['no-tags']).toBeUndefined();
  });

  it('frontend tag has no rule — element gets no style', () => {
    const result = resolveAndApplyToGraph(graph, style, () => null);
    if (result.ok) expect(result.value.nodes?.['web']).toBeUndefined();
  });

  it('flattens edge tagStyles too', () => {
    const result = resolveAndApplyToGraph(graph, style, () => null);
    if (result.ok) expect(result.value.edges?.['e1']).toEqual({ lineStyle: 'dashed' });
  });

  it('output has no tagStyles section after flattening', () => {
    const result = resolveAndApplyToGraph(graph, style, () => null);
    if (result.ok) expect(result.value.tagStyles).toBeUndefined();
  });
});
