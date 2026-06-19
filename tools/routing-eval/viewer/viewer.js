// routing-eval viewer.
//
// Static page: loads the newest run's manifest.json, lets the user step
// through every (algorithm × scenario) cell, capture a 1–5 rating and
// optional comment, and download the lot as a JSON file.
//
// State is kept in two layers:
//   - in-memory `state`: manifest + current cell index + ratings dict.
//   - localStorage `routing-eval:<runTs>`: ratings dict, so reloads
//     don't lose work between sessions.
//
// URL params:
//   ?run=<timestamp>   pin to a specific run directory.
//   ?algorithm=<name>  jump to first matching cell at load.
//   ?scenario=<name>   jump to first matching cell at load.

const params = new URLSearchParams(location.search);

const state = {
  runTs: null,           // string, e.g. "20260524-061500"
  runDir: null,          // string, "../runs/<runTs>/"
  manifest: null,        // {algorithms, scenarios, cells, ...}
  cellIdx: 0,            // current cell index into manifest.cells
  ratings: Object.create(null), // key "<algo>|<scen>" → {rating, comment}
};

async function init() {
  await loadRun();
  if (!state.manifest) return;
  loadRatingsFromLocalStorage();
  applyUrlNavigation();
  bindUi();
  renderCurrent();
}

async function loadRun() {
  const explicit = params.get('run');
  let runTs = explicit;
  if (!runTs) {
    runTs = await fetchLatestRunTimestamp();
  }
  if (!runTs) {
    document.getElementById('run-label').textContent = 'no run found (run `node tools/routing-eval/run.mjs` first)';
    return;
  }
  state.runTs = runTs;
  state.runDir = `../runs/${runTs}/`;
  try {
    const manifest = await fetchJson(`${state.runDir}manifest.json`);
    state.manifest = manifest;
    document.getElementById('run-label').textContent =
      `run ${runTs} • ${manifest.cells.length} cells (${manifest.algorithms.length} algorithms × ${manifest.scenarios.length} scenarios)`;
  } catch (err) {
    document.getElementById('run-label').textContent =
      `failed to load run ${runTs}: ${err.message}`;
  }
}

async function fetchLatestRunTimestamp() {
  // Try symlink first.
  try {
    // Some servers serve symlinks transparently; some don't. We try to GET
    // the manifest under runs/latest/ first.
    const r = await fetch('../runs/latest/manifest.json');
    if (r.ok) {
      const manifest = await r.json();
      return manifest.timestamp;
    }
  } catch {}
  // Fallback: latest.txt pointer.
  try {
    const r = await fetch('../runs/latest.txt');
    if (r.ok) {
      const txt = (await r.text()).trim();
      if (txt) return txt;
    }
  } catch {}
  return null;
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

function localStorageKey() { return `routing-eval:${state.runTs}`; }

function loadRatingsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(localStorageKey());
    if (raw) state.ratings = JSON.parse(raw);
  } catch {}
}

function saveRatingsToLocalStorage() {
  try {
    localStorage.setItem(localStorageKey(), JSON.stringify(state.ratings));
  } catch {}
}

function applyUrlNavigation() {
  const algo = params.get('algorithm');
  const scen = params.get('scenario');
  if (!algo && !scen) return;
  const idx = state.manifest.cells.findIndex(c =>
    (!algo || c.algorithm === algo) &&
    (!scen || c.scenario === scen),
  );
  if (idx >= 0) state.cellIdx = idx;
}

function cellKey(c) { return `${c.algorithm}|${c.scenario}`; }

function setRating(rating) {
  const c = state.manifest.cells[state.cellIdx];
  const k = cellKey(c);
  const existing = state.ratings[k] ?? { comment: '' };
  state.ratings[k] = { rating, comment: existing.comment };
  saveRatingsToLocalStorage();
  renderRatingControls();
  renderProgress();
}

function clearRating() {
  const c = state.manifest.cells[state.cellIdx];
  const k = cellKey(c);
  const existing = state.ratings[k];
  if (existing) {
    // Preserve any typed comment; only the rating is cleared. If the entry
    // had no comment either, drop it entirely so progress + downloads stay
    // tidy.
    const comment = existing.comment ?? '';
    if (comment) {
      state.ratings[k] = { rating: null, comment };
    } else {
      delete state.ratings[k];
    }
    saveRatingsToLocalStorage();
  }
  renderRatingControls();
  renderProgress();
}

function setComment(comment) {
  const c = state.manifest.cells[state.cellIdx];
  const k = cellKey(c);
  const existing = state.ratings[k] ?? {};
  state.ratings[k] = { rating: existing.rating, comment };
  saveRatingsToLocalStorage();
}

function step(delta) {
  const n = state.manifest.cells.length;
  state.cellIdx = (state.cellIdx + delta + n) % n;
  renderCurrent();
}

function bindUi() {
  document.getElementById('prev-btn').addEventListener('click', () => step(-1));
  document.getElementById('next-btn').addEventListener('click', () => step(+1));
  document.getElementById('download-feedback').addEventListener('click', downloadFeedback);

  for (const btn of document.querySelectorAll('.rating-btn')) {
    btn.addEventListener('click', () => setRating(parseInt(btn.dataset.rating, 10)));
  }
  document.getElementById('rating-clear').addEventListener('click', clearRating);

  document.getElementById('rating-comment').addEventListener('input', e => {
    setComment(e.target.value);
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'n') { step(+1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'p') { step(-1); e.preventDefault(); }
    else if (e.key >= '1' && e.key <= '5') { setRating(parseInt(e.key, 10)); e.preventDefault(); }
    else if (e.key === '0') { clearRating(); e.preventDefault(); }
  });
}

function renderCurrent() {
  const c = state.manifest.cells[state.cellIdx];
  if (!c) return;

  // URL reflects current selection.
  const url = new URL(location.href);
  url.searchParams.set('algorithm', c.algorithm);
  url.searchParams.set('scenario', c.scenario);
  if (state.runTs) url.searchParams.set('run', state.runTs);
  history.replaceState({}, '', url.toString());

  document.getElementById('cell-position').textContent =
    `${state.cellIdx + 1} / ${state.manifest.cells.length}`;
  document.getElementById('algo-name').textContent = c.algorithm;
  document.getElementById('scenario-name').textContent = c.scenario;

  const scenObj = state.manifest.scenarios.find(s => s.name === c.scenario);
  document.getElementById('scenario-desc').textContent =
    scenObj?.description ?? '';

  const status = document.getElementById('cell-status');
  if (c.ok) {
    status.textContent = 'ok';
    status.className = 'ok';
  } else {
    status.textContent = `FAIL: ${c.errorMessage || 'unknown error'}`;
    status.className = 'fail';
  }

  // Prefer the faithful Konva screenshot; fall back to the SVG approximation
  // if no PNG exists for this cell (i.e. render-screens.mjs wasn't run).
  const base = `${state.runDir}${c.algorithm}/${c.scenario}/`;
  const png = document.getElementById('png-frame');
  const svg = document.getElementById('svg-frame');
  const probe = new Image();
  probe.onload = () => { png.src = probe.src; png.style.display = ''; svg.style.display = 'none'; };
  probe.onerror = () => { svg.data = `${base}routing.svg`; png.style.display = 'none'; svg.style.display = ''; };
  probe.src = `${base}routing.png`;

  renderMetrics(c.metrics);
  renderRatingControls();
  renderProgress();
}

function renderMetrics(m) {
  const tbody = document.querySelector('#metrics-table tbody');
  tbody.innerHTML = '';
  const rows = [
    ['nodes',           m.nodeCount,            null],
    ['edges',           m.edgeCount,            null],
    ['compute time',    `${m.computeTimeMs} ms`, null],
    ['edge crossings',  m.edgeCrossings,        m.edgeCrossings > 0 ? 'bad' : 'good'],
    ['sibling crossings', m.siblingCrossings,   m.siblingCrossings > 0 ? 'bad' : 'good'],
    ['edges through nodes', m.edgesThroughNodes, m.edgesThroughNodes > 0 ? 'bad' : 'good'],
    ['self-intersections', m.selfIntersections, m.selfIntersections > 0 ? 'bad' : 'good'],
    ['hard fail count', m.hardFailCount,        m.hardFailCount > 0 ? 'bad' : 'good'],
    ['bend count',      m.bendCount,            null],
    ['max curvature',   `${(m.maxCurvature ?? 0).toFixed(3)} rad`, null],
    ['total curvature', `${(m.totalCurvature ?? 0).toFixed(2)} rad`, null],
    ['max bulge ratio', (m.maxBulgeRatio ?? 0).toFixed(3), null],
    ['min clearance',   `${(m.minObstacleClearance ?? 0).toFixed(1)} px`, null],
    ['total length',    `${(m.totalLength ?? 0).toFixed(0)} px`, null],
    ['composite score', fmt(m.compositeScore), null],
  ];
  for (const [k, v, cls] of rows) {
    const tr = document.createElement('tr');
    const tdK = document.createElement('td'); tdK.className = 'k'; tdK.textContent = k;
    const tdV = document.createElement('td'); tdV.className = 'v ' + (cls ?? ''); tdV.textContent = String(v);
    tr.appendChild(tdK); tr.appendChild(tdV);
    tbody.appendChild(tr);
  }
}

function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (!isFinite(n)) return String(n);
  return n.toFixed(2);
}

function renderRatingControls() {
  const c = state.manifest.cells[state.cellIdx];
  const r = state.ratings[cellKey(c)];
  const current = r?.rating ?? null;
  for (const btn of document.querySelectorAll('.rating-btn')) {
    const v = parseInt(btn.dataset.rating, 10);
    btn.classList.toggle('active', v === current);
  }
  document.getElementById('rating-comment').value = r?.comment ?? '';
}

function renderProgress() {
  const rated = Object.values(state.ratings).filter(r => typeof r.rating === 'number').length;
  document.getElementById('rating-progress').textContent =
    `${rated} / ${state.manifest.cells.length} rated`;
}

function downloadFeedback() {
  const payload = {
    runTimestamp: state.runTs,
    ratedAt: new Date().toISOString(),
    cells: state.ratings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedback-${state.runTs}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

init();
