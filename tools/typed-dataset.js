/** Shared loader for typed todo-graph datasets: classifies nodes
 *  (tags win; next.org heuristics as fallback), bakes type visuals into
 *  per-node styles (the draft load path doesn't run the tagStyles
 *  resolver), and returns a localStorage-injectable draft. Used by
 *  next-typed-viz.js and layout-metrics.js. */
const fs = require('fs');
const yaml = require('js-yaml');

const TYPES = ['category', 'goal', 'question', 'note', 'task'];
// next.org heuristics (its nodes carry no type tags yet).
const CATEGORY_IDS = new Set(['n0', 'n1', 'n29', 'n8', 'n25']);
const GOAL_IDS = new Set(['n41']); // "Compete with Obsidian"
const NOTE_IDS = new Set(['n21', 'n22', 'n31', 'n32', 'n40']);

function classify(id, node) {
  const tagged = (node.tags ?? []).find(t => TYPES.includes(t));
  if (tagged) return tagged;
  if (CATEGORY_IDS.has(id)) return 'category';
  if (GOAL_IDS.has(id)) return 'goal';
  if ((node.label ?? '').trim().endsWith('?')) return 'question';
  if (NOTE_IDS.has(id)) return 'note';
  return 'task';
}

// Shape + size per type (fill/stroke would be better; blocked on the color
// round-trip bug).
const TYPE_STYLES = {
  category: { shape: 'box', w: 280, h: 100, fontSize: 30 },
  goal:     { shape: 'circle', w: 190, h: 190, fontSize: 20 },
  question: { shape: 'diamond', w: 240, h: 130, fontSize: 14 },
  note:     { shape: 'box', w: 160, h: 50, fontSize: 10 },
  task:     {}, // plugin defaults
};

/** Dataset YAML text from either a plain .yaml file or a TS module that
 *  exports it as a single template literal (the kidraw-dev sample lives in
 *  src/app/services/samples/kidraw-dev-sample.ts so the app bundles it). */
function loadYamlText(datasetPath) {
  const raw = fs.readFileSync(datasetPath, 'utf8');
  if (!datasetPath.endsWith('.ts')) return raw;
  const first = raw.indexOf('`');
  const last = raw.lastIndexOf('`');
  if (first < 0 || last <= first) throw new Error(`no template literal in ${datasetPath}`);
  return raw.slice(first + 1, last);
}

/** → {draft, counts} */
function buildTypedDraft(datasetPath) {
  const doc = yaml.load(loadYamlText(datasetPath));
  const inline = (doc.styles ?? [])[0] ?? {};
  const style = { kdStyle: 1, nodes: { ...(inline.nodes ?? {}) } };
  for (const k of ['imports', 'tagStyles', 'edges', 'view']) {
    if (inline[k] !== undefined) style[k] = inline[k];
  }
  const counts = {};
  for (const [id, node] of Object.entries(doc.semantics.nodes)) {
    const type = classify(id, node);
    counts[type] = (counts[type] ?? 0) + 1;
    node.tags = [...new Set([...(node.tags ?? []), type])];
    style.nodes[id] = { ...(style.nodes[id] ?? {}), ...TYPE_STYLES[type] };
  }
  const draft = {
    version: 2, doc, style, filePath: null, dirty: false, savedAt: Date.now(),
  };
  return { draft, counts };
}

module.exports = { buildTypedDraft, classify, TYPE_STYLES };
