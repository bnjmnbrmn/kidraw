import {
  EdgeDirected,
  EdgeSemantics,
  GraphSemantics,
  InlineStyleSet,
  KidrawGraphDoc,
  KidrawStyleSet,
  LineStyleName,
  NodeShapeName,
  NodeSemantics,
  ParseResult,
  StyleRef,
  fail,
  ok,
} from './types';

const DIRECTED_VALUES: ReadonlySet<string> = new Set([
  'directed',
  'undirected',
  'bidirectional',
]);

const SHAPE_VALUES: ReadonlySet<string> = new Set([
  'box',
  'circle',
  'diamond',
  'junction',
  'invisible',
]);

const TEXT_OVERFLOW_VALUES: ReadonlySet<string> = new Set([
  'clip',
  'shrink-font',
  'ellipsis',
  'widen-h',
  'widen-v',
  'widen-both',
]);

const LINE_STYLE_VALUES: ReadonlySet<string> = new Set([
  'solid',
  'dashed',
  'dotted',
]);

// ─── Public: parse ────────────────────────────────────────────────────────

export function parseGraphDocJson(text: string): ParseResult<KidrawGraphDoc> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return fail(`Invalid JSON: ${(e as Error).message}`);
  }
  return validateGraphDoc(raw);
}

export function parseStyleSetJson(text: string): ParseResult<KidrawStyleSet> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return fail(`Invalid JSON: ${(e as Error).message}`);
  }
  return validateStyleSet(raw);
}

// ─── Public: serialize ────────────────────────────────────────────────────

export function serializeGraphDocJson(
  doc: KidrawGraphDoc,
  opts: { pretty?: boolean } = {},
): string {
  return JSON.stringify(doc, null, opts.pretty === false ? 0 : 2);
}

export function serializeStyleSetJson(
  style: KidrawStyleSet,
  opts: { pretty?: boolean } = {},
): string {
  return JSON.stringify(style, null, opts.pretty === false ? 0 : 2);
}

// ─── Validation ───────────────────────────────────────────────────────────

export function validateGraphDoc(raw: unknown): ParseResult<KidrawGraphDoc> {
  if (!isObject(raw)) return fail('Graph document must be a JSON object');
  if (raw['kidraw'] !== 1) {
    return fail(`Unsupported "kidraw" version: ${JSON.stringify(raw['kidraw'])} (expected 1)`);
  }
  if (!Array.isArray(raw['styles'])) {
    return fail('Graph document must have a "styles" array');
  }
  const stylesResult = validateStyleRefs(raw['styles']);
  if (!stylesResult.ok) return stylesResult;

  if (!isObject(raw['semantics'])) {
    return fail('Graph document must have a "semantics" object');
  }
  const semanticsResult = validateSemantics(raw['semantics']);
  if (!semanticsResult.ok) return semanticsResult;

  return ok({
    kidraw: 1,
    styles: stylesResult.value,
    semantics: semanticsResult.value,
  });
}

export function validateStyleSet(raw: unknown): ParseResult<KidrawStyleSet> {
  if (!isObject(raw)) return fail('Style set must be a JSON object');
  if (raw['kdStyle'] !== 1) {
    return fail(`Unsupported "kdStyle" version: ${JSON.stringify(raw['kdStyle'])} (expected 1)`);
  }
  const body = validateStyleBody(raw, 'style set');
  if (!body.ok) return body;
  return ok({ kdStyle: 1, ...body.value });
}

export function validateInlineStyleSet(raw: unknown): ParseResult<InlineStyleSet> {
  if (!isObject(raw)) return fail('Inline style must be an object');
  if (typeof raw['name'] !== 'string' || raw['name'].length === 0) {
    return fail('Inline style is missing a non-empty "name" field');
  }
  const body = validateStyleBody(raw, `inline style "${raw['name']}"`);
  if (!body.ok) return body;
  return ok({ name: raw['name'], ...body.value });
}

// ─── Internal validators ──────────────────────────────────────────────────

interface StyleBody {
  imports?: string[];
  tagStyles?: { [tag: string]: any };
  nodes?: { [id: string]: any };
  edges?: { [id: string]: any };
  view?: { zoom: number; panX: number; panY: number };
}

function validateStyleBody(raw: { [k: string]: unknown }, label: string): ParseResult<StyleBody> {
  const out: StyleBody = {};

  if (raw['imports'] !== undefined) {
    if (!Array.isArray(raw['imports']) || !raw['imports'].every(s => typeof s === 'string')) {
      return fail(`${label}: "imports" must be an array of relative paths`);
    }
    out.imports = raw['imports'] as string[];
  }

  if (raw['tagStyles'] !== undefined) {
    if (!isObject(raw['tagStyles'])) {
      return fail(`${label}: "tagStyles" must be an object`);
    }
    out.tagStyles = raw['tagStyles'] as { [tag: string]: any };
  }

  if (raw['nodes'] !== undefined) {
    if (!isObject(raw['nodes'])) return fail(`${label}: "nodes" must be an object`);
    for (const [id, props] of Object.entries(raw['nodes'])) {
      const r = validateNodeStyleProps(props, `${label} > nodes["${id}"]`);
      if (!r.ok) return r;
    }
    out.nodes = raw['nodes'] as { [id: string]: any };
  }

  if (raw['edges'] !== undefined) {
    if (!isObject(raw['edges'])) return fail(`${label}: "edges" must be an object`);
    for (const [id, props] of Object.entries(raw['edges'])) {
      const r = validateEdgeStyleProps(props, `${label} > edges["${id}"]`);
      if (!r.ok) return r;
    }
    out.edges = raw['edges'] as { [id: string]: any };
  }

  if (raw['view'] !== undefined) {
    if (!isObject(raw['view'])) return fail(`${label}: "view" must be an object`);
    const v = raw['view'] as { [k: string]: unknown };
    if (typeof v['zoom'] !== 'number' || typeof v['panX'] !== 'number' || typeof v['panY'] !== 'number') {
      return fail(`${label}: "view" must have numeric zoom, panX, panY`);
    }
    out.view = { zoom: v['zoom'], panX: v['panX'], panY: v['panY'] };
  }

  return ok(out);
}

function validateNodeStyleProps(raw: unknown, label: string): ParseResult<{}> {
  if (!isObject(raw)) return fail(`${label} must be an object`);
  const numericFields = ['x', 'y', 'w', 'h', 'strokeWidth', 'fontSize', 'opacity'];
  for (const f of numericFields) {
    if (raw[f] !== undefined && typeof raw[f] !== 'number') {
      return fail(`${label}.${f} must be a number`);
    }
  }
  if (raw['shape'] !== undefined && !SHAPE_VALUES.has(raw['shape'] as string)) {
    return fail(`${label}.shape must be one of: box, circle, diamond, junction, invisible`);
  }
  if (raw['textOverflow'] !== undefined && !TEXT_OVERFLOW_VALUES.has(raw['textOverflow'] as string)) {
    return fail(`${label}.textOverflow must be one of: clip, shrink-font, ellipsis, widen-h, widen-v, widen-both`);
  }
  return ok({});
}

function validateEdgeStyleProps(raw: unknown, label: string): ParseResult<{}> {
  if (!isObject(raw)) return fail(`${label} must be an object`);
  const numericFields = ['strokeWidth', 'fontSize', 'opacity'];
  for (const f of numericFields) {
    if (raw[f] !== undefined && typeof raw[f] !== 'number') {
      return fail(`${label}.${f} must be a number`);
    }
  }
  if (raw['lineStyle'] !== undefined && !LINE_STYLE_VALUES.has(raw['lineStyle'] as string)) {
    return fail(`${label}.lineStyle must be one of: solid, dashed, dotted`);
  }
  if (raw['waypoints'] !== undefined) {
    if (!Array.isArray(raw['waypoints'])) return fail(`${label}.waypoints must be an array`);
    for (let i = 0; i < raw['waypoints'].length; i++) {
      const w = raw['waypoints'][i];
      if (!isObject(w) || typeof w['x'] !== 'number' || typeof w['y'] !== 'number') {
        return fail(`${label}.waypoints[${i}] must have numeric x, y`);
      }
    }
  }
  return ok({});
}

function validateStyleRefs(raw: unknown[]): ParseResult<StyleRef[]> {
  const out: StyleRef[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = validateStyleRef(raw[i], `styles[${i}]`);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

function validateStyleRef(raw: unknown, label: string): ParseResult<StyleRef> {
  if (typeof raw === 'string') {
    if (raw.length === 0) return fail(`${label}: path must not be empty`);
    return ok(raw);
  }
  if (isObject(raw)) {
    return validateInlineStyleSet(raw);
  }
  return fail(`${label}: must be a string (path) or object (inline style)`);
}

function validateSemantics(raw: { [k: string]: unknown }): ParseResult<GraphSemantics> {
  if (!isObject(raw['nodes'])) return fail('semantics.nodes must be an object');
  if (!isObject(raw['edges'])) return fail('semantics.edges must be an object');

  const nodes: { [id: string]: NodeSemantics } = {};
  for (const [id, n] of Object.entries(raw['nodes'])) {
    const r = validateNodeSemantics(n, id);
    if (!r.ok) return r;
    nodes[id] = r.value;
  }

  const edges: { [id: string]: EdgeSemantics } = {};
  for (const [id, e] of Object.entries(raw['edges'])) {
    const r = validateEdgeSemantics(e, id);
    if (!r.ok) return r;
    if (!(r.value.from in nodes)) {
      return fail(`edge "${id}".from references unknown node "${r.value.from}"`);
    }
    if (!(r.value.to in nodes)) {
      return fail(`edge "${id}".to references unknown node "${r.value.to}"`);
    }
    edges[id] = r.value;
  }

  return ok({ nodes, edges });
}

function validateNodeSemantics(raw: unknown, id: string): ParseResult<NodeSemantics> {
  if (!isObject(raw)) return fail(`node "${id}" must be an object`);
  const out: NodeSemantics = {};
  for (const field of ['label', 'description', 'notes'] as const) {
    if (raw[field] !== undefined) {
      if (typeof raw[field] !== 'string') return fail(`node "${id}".${field} must be a string`);
      out[field] = raw[field] as string;
    }
  }
  if (raw['tags'] !== undefined) {
    if (!Array.isArray(raw['tags']) || !raw['tags'].every(t => typeof t === 'string')) {
      return fail(`node "${id}".tags must be an array of strings`);
    }
    out.tags = raw['tags'];
  }
  return ok(out);
}

function validateEdgeSemantics(raw: unknown, id: string): ParseResult<EdgeSemantics> {
  if (!isObject(raw)) return fail(`edge "${id}" must be an object`);
  if (typeof raw['from'] !== 'string' || raw['from'].length === 0) {
    return fail(`edge "${id}".from must be a non-empty string`);
  }
  if (typeof raw['to'] !== 'string' || raw['to'].length === 0) {
    return fail(`edge "${id}".to must be a non-empty string`);
  }
  const out: EdgeSemantics = { from: raw['from'], to: raw['to'] };
  if (raw['directed'] !== undefined) {
    if (!DIRECTED_VALUES.has(raw['directed'] as string)) {
      return fail(`edge "${id}".directed must be one of: directed, undirected, bidirectional`);
    }
    out.directed = raw['directed'] as EdgeDirected;
  }
  if (raw['tags'] !== undefined) {
    if (!Array.isArray(raw['tags']) || !raw['tags'].every(t => typeof t === 'string')) {
      return fail(`edge "${id}".tags must be an array of strings`);
    }
    out.tags = raw['tags'];
  }
  if (raw['labels'] !== undefined) {
    if (!Array.isArray(raw['labels'])) return fail(`edge "${id}".labels must be an array`);
    const labels = [];
    for (let i = 0; i < raw['labels'].length; i++) {
      const l = raw['labels'][i];
      if (!isObject(l) || typeof l['text'] !== 'string') {
        return fail(`edge "${id}".labels[${i}] must have a string "text" field`);
      }
      labels.push({ text: l['text'] as string });
    }
    out.labels = labels;
  }
  return ok(out);
}

function isObject(v: unknown): v is { [key: string]: unknown } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
