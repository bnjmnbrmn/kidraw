// Central scenario registry. The order here drives the viewer's prev/next
// walk; group bug-finders first, then common shapes, then stress cases so
// the rater hits the high-signal cells early.

import * as antiParallel  from './anti-parallel.mjs';
import * as selfLoop      from './self-loop.mjs';
import * as multiParallel from './multi-parallel.mjs';
import * as fanOut8       from './fan-out-8.mjs';
import * as fanIn8        from './fan-in-8.mjs';
import * as line3         from './line-3.mjs';
import * as tree5         from './tree-5.mjs';
import * as mesh3x3       from './mesh-3x3.mjs';
import * as hubSpoke      from './hub-spoke.mjs';
import * as cycle4        from './cycle-4.mjs';
import * as dense         from './dense.mjs';
import * as sparse        from './sparse.mjs';

export const ALL_SCENARIOS = [
  antiParallel,
  selfLoop,
  multiParallel,
  fanOut8,
  fanIn8,
  line3,
  tree5,
  mesh3x3,
  hubSpoke,
  cycle4,
  dense,
  sparse,
];
