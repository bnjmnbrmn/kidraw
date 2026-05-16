import {
  isYamlFilename,
  parseGraphDocByFilename,
  parseGraphDocJson,
  parseGraphDocYaml,
  parseStyleSetJson,
  parseStyleSetYaml,
  serializeGraphDocByFilename,
  serializeGraphDocJson,
  serializeGraphDocYaml,
  serializeStyleSetJson,
  serializeStyleSetYaml,
  validateInlineStyleSet,
} from './parser';
import { KidrawGraphDoc, KidrawStyleSet, isInlineStyleSet, styleRefId } from './types';

describe('file-format parser', () => {
  // ─── Graph document parsing ─────────────────────────────────────────────

  it('parses a minimal graph document', () => {
    const json = JSON.stringify({
      kidraw: 1,
      styles: [],
      semantics: { nodes: {}, edges: {} },
    });
    const result = parseGraphDocJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kidraw).toBe(1);
      expect(result.value.styles.length).toBe(0);
      expect(Object.keys(result.value.semantics.nodes).length).toBe(0);
    }
  });

  it('parses a graph document with nodes, edges, and external + inline styles', () => {
    const doc = {
      kidraw: 1,
      styles: [
        './overview.kd-style.json',
        {
          name: 'quick-tweak',
          imports: ['./theme.kd-style.json'],
          nodes: { 'auth-service': { fontSize: 18 } },
        },
      ],
      semantics: {
        nodes: {
          'auth-service': {
            label: 'Auth Service',
            description: 'Handles OAuth.',
            tags: ['backend', 'auth'],
          },
          'user-db': { label: 'User DB' },
        },
        edges: {
          'auth-reads-users': {
            from: 'auth-service',
            to: 'user-db',
            directed: 'directed',
            labels: [{ text: 'SELECT *' }],
          },
        },
      },
    };
    const result = parseGraphDocJson(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.styles.length).toBe(2);
      expect(typeof result.value.styles[0]).toBe('string');
      expect(isInlineStyleSet(result.value.styles[1])).toBe(true);
      expect(styleRefId(result.value.styles[0])).toBe('./overview.kd-style.json');
      expect(styleRefId(result.value.styles[1])).toBe('quick-tweak');
    }
  });

  it('rejects a graph doc with the wrong "kidraw" version', () => {
    const json = JSON.stringify({ kidraw: 2, styles: [], semantics: { nodes: {}, edges: {} } });
    const result = parseGraphDocJson(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('kidraw');
  });

  it('rejects a graph doc whose edge references an unknown node', () => {
    const json = JSON.stringify({
      kidraw: 1,
      styles: [],
      semantics: {
        nodes: { 'a': { label: 'A' } },
        edges: { 'e1': { from: 'a', to: 'ghost' } },
      },
    });
    const result = parseGraphDocJson(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ghost');
  });

  it('rejects an inline style with no "name" field', () => {
    const json = JSON.stringify({
      kidraw: 1,
      styles: [{ imports: [] }],
      semantics: { nodes: {}, edges: {} },
    });
    const result = parseGraphDocJson(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain('name');
  });

  it('rejects malformed JSON with a descriptive error', () => {
    const result = parseGraphDocJson('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Invalid JSON');
  });

  // ─── Style set parsing ──────────────────────────────────────────────────

  it('parses a minimal style set', () => {
    const result = parseStyleSetJson(JSON.stringify({ kdStyle: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kdStyle).toBe(1);
  });

  it('parses a style set with imports, tagStyles, nodes, edges, view', () => {
    const style = {
      kdStyle: 1,
      imports: ['./base.kd-style.json'],
      tagStyles: { backend: { fill: '#e8f0fe' } },
      nodes: { 'auth-service': { x: 100, y: 100, shape: 'box', fontSize: 14 } },
      edges: { 'e1': { lineStyle: 'dashed', waypoints: [{ x: 50, y: 50 }] } },
      view: { zoom: 1, panX: 0, panY: 0 },
    };
    const result = parseStyleSetJson(JSON.stringify(style));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imports?.length).toBe(1);
      expect(result.value.nodes?.['auth-service']?.x).toBe(100);
      expect(result.value.edges?.['e1']?.lineStyle).toBe('dashed');
      expect(result.value.view?.zoom).toBe(1);
    }
  });

  it('rejects a style set with the wrong "kdStyle" version', () => {
    const result = parseStyleSetJson(JSON.stringify({ kdStyle: 2 }));
    expect(result.ok).toBe(false);
  });

  it('rejects a style set with a bad shape value', () => {
    const style = { kdStyle: 1, nodes: { x: { shape: 'hexagon' } } };
    const result = parseStyleSetJson(JSON.stringify(style));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('shape');
  });

  it('rejects a style set with a non-numeric x coordinate', () => {
    const style = { kdStyle: 1, nodes: { x: { x: 'left' } } };
    const result = parseStyleSetJson(JSON.stringify(style));
    expect(result.ok).toBe(false);
  });

  // ─── Inline style direct validation ─────────────────────────────────────

  it('accepts a minimal inline style with just a name', () => {
    const result = validateInlineStyleSet({ name: 'tweak' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('tweak');
  });

  it('rejects an inline style with an empty name', () => {
    const result = validateInlineStyleSet({ name: '' });
    expect(result.ok).toBe(false);
  });

  // ─── Round-trip ─────────────────────────────────────────────────────────

  it('round-trips a graph document through serialize/parse', () => {
    const doc: KidrawGraphDoc = {
      kidraw: 1,
      styles: [
        './a.kd-style.json',
        { name: 'inline-b', tagStyles: { critical: { strokeWidth: 2 } } },
      ],
      semantics: {
        nodes: { 'n1': { label: 'One', tags: ['x'] } },
        edges: {},
      },
    };
    const serialized = serializeGraphDocJson(doc);
    const parsed = parseGraphDocJson(serialized);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual(doc);
    }
  });

  it('round-trips a style set through serialize/parse', () => {
    const style: KidrawStyleSet = {
      kdStyle: 1,
      imports: ['./base.kd-style.json'],
      nodes: { 'n1': { x: 10, y: 20, fontSize: 14 } },
      view: { zoom: 1.5, panX: -50, panY: 100 },
    };
    const serialized = serializeStyleSetJson(style);
    const parsed = parseStyleSetJson(serialized);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(style);
  });

  // ─── YAML support ───────────────────────────────────────────────────────

  it('round-trips a graph document through YAML serialize/parse', () => {
    const doc: KidrawGraphDoc = {
      kidraw: 1,
      styles: ['./theme.kd-style.yaml'],
      semantics: {
        nodes: { 'auth-service': { label: 'Auth', tags: ['backend'] } },
        edges: {},
      },
    };
    const text = serializeGraphDocYaml(doc);
    expect(text).toContain('kidraw: 1');
    const parsed = parseGraphDocYaml(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(doc);
  });

  it('round-trips a style set through YAML serialize/parse', () => {
    const style: KidrawStyleSet = {
      kdStyle: 1,
      imports: ['./base.kd-style.yaml'],
      nodes: { n1: { x: 50, y: 100, shape: 'circle' } },
    };
    const text = serializeStyleSetYaml(style);
    const parsed = parseStyleSetYaml(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(style);
  });

  it('rejects malformed YAML with a descriptive error', () => {
    const result = parseGraphDocYaml('kidraw: 1\nstyles: [\n  invalid');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Invalid YAML');
  });

  it('isYamlFilename detects .yaml, .yml, and rejects .json', () => {
    expect(isYamlFilename('foo.kidraw.yaml')).toBe(true);
    expect(isYamlFilename('foo.kidraw.YML')).toBe(true);
    expect(isYamlFilename('foo.kidraw.json')).toBe(false);
    expect(isYamlFilename('something.txt')).toBe(false);
  });

  it('parseGraphDocByFilename dispatches by extension', () => {
    const yamlDoc = 'kidraw: 1\nstyles: []\nsemantics:\n  nodes: {}\n  edges: {}\n';
    const jsonDoc = '{"kidraw":1,"styles":[],"semantics":{"nodes":{},"edges":{}}}';
    expect(parseGraphDocByFilename(yamlDoc, 'foo.kidraw.yaml').ok).toBe(true);
    expect(parseGraphDocByFilename(jsonDoc, 'foo.kidraw.json').ok).toBe(true);
  });

  it('serializeGraphDocByFilename writes YAML when filename is .yaml', () => {
    const doc: KidrawGraphDoc = { kidraw: 1, styles: [], semantics: { nodes: {}, edges: {} } };
    const yamlOut = serializeGraphDocByFilename(doc, 'foo.kidraw.yaml');
    const jsonOut = serializeGraphDocByFilename(doc, 'foo.kidraw.json');
    expect(yamlOut).not.toContain('"kidraw"');
    expect(jsonOut).toContain('"kidraw"');
  });

  it('serializeGraphDocJson respects pretty=false for compact output', () => {
    const doc: KidrawGraphDoc = {
      kidraw: 1,
      styles: [],
      semantics: { nodes: {}, edges: {} },
    };
    const pretty = serializeGraphDocJson(doc);
    const compact = serializeGraphDocJson(doc, { pretty: false });
    expect(pretty).toContain('\n');
    expect(compact).not.toContain('\n');
  });
});
