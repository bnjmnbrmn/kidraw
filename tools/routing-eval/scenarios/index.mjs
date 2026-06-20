// Central scenario registry. The order here drives the viewer's prev/next
// walk; group bug-finders first, then common shapes, then stress cases so
// the rater hits the high-signal cells early.

import * as antiParallel        from './anti-parallel.mjs';
import * as selfLoop            from './self-loop.mjs';
import * as multiParallel       from './multi-parallel.mjs';
import * as fanOut8             from './fan-out-8.mjs';
import * as fanIn8              from './fan-in-8.mjs';
import * as convergeCircular    from './converge-circular.mjs';
import * as line3               from './line-3.mjs';
import * as tree5               from './tree-5.mjs';
import * as mesh3x3             from './mesh-3x3.mjs';
import * as hubSpoke            from './hub-spoke.mjs';
import * as cycle4              from './cycle-4.mjs';
import * as dense               from './dense.mjs';
import * as sparse              from './sparse.mjs';

// "Visual ambiguity" — probes shallow crossings, parallel-close passes,
// and other things the eye reads as confusing.
import * as nearParallelCross   from './near-parallel-cross.mjs';
import * as nearParallelCross6  from './near-parallel-cross-6.mjs';
import * as parallelRuns        from './parallel-runs.mjs';
import * as wideAntiParallel    from './wide-anti-parallel.mjs';
import * as farAntiParallel     from './far-anti-parallel.mjs';
import * as diamondX            from './diamond-x.mjs';
import * as tangentGrazing      from './tangent-grazing.mjs';

// Obstacle handling — edges must route around non-incident nodes.
import * as bypassObstacle      from './bypass-obstacle.mjs';
import * as bypassMany          from './bypass-many.mjs';
import * as edgeAroundCluster   from './edge-around-cluster.mjs';
import * as bottleneckChannel   from './bottleneck-channel.mjs';
import * as wallWithGap         from './wall-with-gap.mjs';
import * as maze                from './maze.mjs';
import * as culDeSac            from './cul-de-sac.mjs';

// Scale + density adaptation.
import * as mixedScale          from './mixed-scale.mjs';
import * as asymmetricDensity   from './asymmetric-density.mjs';
import * as tightCluster        from './tight-cluster.mjs';

// Trees, lines, branches.
import * as linearThenBranch    from './linear-then-branch.mjs';
import * as branchedLine        from './branched-line.mjs';

// Famous / classic graphs.
import * as k4Complete          from './k4-complete.mjs';
import * as k5Complete          from './k5-complete.mjs';
import * as k33Bipartite        from './k3-3-bipartite.mjs';
import * as petersen            from './petersen.mjs';
import * as cubeGraph           from './cube-graph.mjs';

// Wraparound geometry.
import * as concentricRings     from './concentric-rings.mjs';
import * as clockFace           from './clock-face.mjs';

export const ALL_SCENARIOS = [
  // Originals (12) — bug-finders first.
  antiParallel,
  selfLoop,
  multiParallel,
  fanOut8,
  fanIn8,
  convergeCircular,
  line3,
  tree5,
  mesh3x3,
  hubSpoke,
  cycle4,
  dense,
  sparse,
  // Visual ambiguity probes (7).
  nearParallelCross,
  nearParallelCross6,
  parallelRuns,
  wideAntiParallel,
  farAntiParallel,
  diamondX,
  tangentGrazing,
  // Obstacle handling (7).
  bypassObstacle,
  bypassMany,
  edgeAroundCluster,
  bottleneckChannel,
  wallWithGap,
  maze,
  culDeSac,
  // Scale + density (3).
  mixedScale,
  asymmetricDensity,
  tightCluster,
  // Trees / lines / branches (2).
  linearThenBranch,
  branchedLine,
  // Classic graphs (5).
  k4Complete,
  k5Complete,
  k33Bipartite,
  petersen,
  cubeGraph,
  // Wraparound (2).
  concentricRings,
  clockFace,
];
