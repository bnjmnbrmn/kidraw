/*
 * One change, one undo step.
 *
 * Found 2026-09-23: setting the diagram type, setting a task status and
 * cycling an edge's direction each left two undo steps — the drawing area
 * snapshots before every graph-changing command, and these three snapshotted
 * again for themselves. One undo reverted the change; the next did nothing.
 *
 * Each case here makes an unrelated change first (deleting a node), then the
 * change under test, then presses undo twice. The first undo must revert the
 * change; the second must bring the deleted node back. With a spare step,
 * the second press is spent on nothing and the node stays gone.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const da = (page, expr) => page.evaluate(`(() => { const da = ${DA}; return ${expr}; })()`);
const run = async (page, body) => {
  await page.evaluate(`(() => { const da = ${DA}; ${body} })()`);
  await settled(page);
};
const undo = page => run(page, `da.handleCommand({kind: 'UNDO'});`);
const nodeCount = page => da(page, `da.drawingLayer.getDANodes().length`);

const loadSample = page => run(page, `const sel = document.querySelector('select.sample-graph-select');
  sel.value = 'basic'; sel.dispatchEvent(new Event('change', {bubbles: true}));`);

// Select exactly one item, so each command acts on a known target.
const selectOnly = (page, which) => run(page, `
  da.drawingLayer.getDANodes().forEach(n => n.isSelected = false);
  da.drawingLayer.getDAEdges().forEach(e => e.isSelected = false);
  ${which}.isSelected = true;`);

const CASES = [
  {
    name: 'diagram type',
    act: `da.handleCommand({kind: 'SET_DIAGRAM_TYPE', typeId: 'todo-graph'});`,
    state: `da.drawingLayer.diagramType`,
  },
  {
    name: 'task status',
    before: `da.handleCommand({kind: 'SET_DIAGRAM_TYPE', typeId: 'todo-graph'}); da.undoRedoService.clear();`,
    target: `da.drawingLayer.getDANodes()[0]`,
    act: `da.handleCommand({kind: 'SET_TASK_STATUS', status: 'done'});`,
    state: `da.drawingLayer.getDANodes()[0].tags.join(',')`,
  },
  {
    name: 'edge direction cycle',
    target: `da.drawingLayer.getDAEdges()[0]`,
    act: `da.handleCommand({kind: 'CYCLE_EDGE_DIRECTEDNESS'});`,
    state: `(e => e.directedness + ':' + e.srcNode.id + '>' + e.destNode.id)(da.drawingLayer.getDAEdges()[0])`,
  },
];

(async () => {
  const browser = await launch();
  for (const c of CASES) {
    const page = await openApp(browser);
    await loadSample(page);
    if (c.before) await run(page, c.before);

    const nodesAtStart = await nodeCount(page);
    await selectOnly(page, `da.drawingLayer.getDANodes().slice(-1)[0]`);
    await run(page, `da.handleCommand({kind: 'DELETE'});`);

    if (c.target) await selectOnly(page, c.target);
    const unchanged = await da(page, c.state);
    await run(page, c.act);
    const changed = await da(page, c.state);
    check(`${c.name}: the command changes something to undo`, changed !== unchanged,
      `${unchanged} → ${changed}`);

    await undo(page);
    check(`${c.name}: one undo reverts it`, await da(page, c.state) === unchanged,
      String(await da(page, c.state)));

    await undo(page);
    const nodesAfter = await nodeCount(page);
    check(`${c.name}: the next undo reverts the change before it`, nodesAfter === nodesAtStart,
      `${nodesAfter} nodes, expected ${nodesAtStart}`);
    await page.close();
  }

  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
