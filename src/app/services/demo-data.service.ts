import { Injectable } from '@angular/core';
import { DANode } from '../drawing-area/da-node';
import { DAEdge } from '../drawing-area/da-edge';
import { DALabel } from '../drawing-area/da-label';
import { DrawingLayer } from '../drawing-area/drawing.layer';
import { NodeShape } from '../drawing-area/command.model';
import { parseGraphDocYaml } from '../lib/file-format/parser';
import { resolveAndApplyToGraph } from '../lib/file-format/resolver';
import { filesToSnapshot } from '../lib/file-format/snapshot-mapping';
import { KIDRAW_DEV_SAMPLE_YAML } from './samples/kidraw-dev-sample';
import { NEXT_WORKING_SAMPLE_YAML } from './samples/next-working-sample';

export interface SampleGraphDef {
  id: string;
  label: string;
}

interface NodeDef {
  x: number;
  y: number;
  text: string;
  shape?: NodeShape;
}

interface EdgeDef {
  src: number;
  dest: number;
  text?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DemoDataService {

  readonly sampleGraphs: SampleGraphDef[] = [
    { id: 'basic', label: 'Basic Flow' },
    { id: 'next-working', label: 'Next Working Graph (recovered)' },
    { id: 'kidraw-dev', label: 'KiDraw Dev (typed todo)' },
    { id: 'fan-tree', label: 'Fan Tree (18-way stress)' },
    { id: 'classes', label: 'Kidraw Classes' },
    { id: 'files', label: 'Project Files' },
    { id: 'modes', label: 'Keymenu States / Events' },
    { id: 'nudge-multi', label: '∥ Multi-edges' },
    { id: 'nudge-fan', label: '∥ Fan-out' },
    { id: 'nudge-converge', label: '∥ Converge' },
  ];

  loadGraph(graphId: string, drawingLayer: DrawingLayer): void {
    drawingLayer.clearAll();
    const builder = this.getGraphBuilder(graphId);
    if (builder) {
      builder(drawingLayer);
    }
    drawingLayer.batchDraw();
  }

  private getGraphBuilder(graphId: string): ((dl: DrawingLayer) => void) | undefined {
    switch (graphId) {
      case 'basic': return dl => this.buildBasicFlow(dl);
      case 'next-working': return dl => this.buildYamlSample(
        dl, NEXT_WORKING_SAMPLE_YAML, 'next-working');
      case 'kidraw-dev': return dl => this.buildKidrawDevTodo(dl);
      case 'fan-tree': return dl => this.buildFanTree(dl);
      case 'classes': return dl => this.buildClassDiagram(dl);
      case 'files': return dl => this.buildFileDiagram(dl);
      case 'modes': return dl => this.buildModeDiagram(dl);
      case 'nudge-multi': return dl => this.buildNudgeMulti(dl);
      case 'nudge-fan': return dl => this.buildNudgeFan(dl);
      case 'nudge-converge': return dl => this.buildNudgeConverge(dl);
      default: return undefined;
    }
  }

  /** The typed non-tree todo graph (KiDraw development), loaded through the
   *  real file pipeline: parse → tagStyles cascade → snapshot. Categories,
   *  goals, questions, and notes get their shapes/sizes from the sample's
   *  own tagStyles, so this sample end-to-end exercises the typed-todo file
   *  format (notes/idea-todo-graph-modeling.md). */
  private buildKidrawDevTodo(dl: DrawingLayer): void {
    this.buildYamlSample(dl, KIDRAW_DEV_SAMPLE_YAML, 'kidraw-dev');
  }

  /** Load a self-contained YAML sample through the same parse, style cascade,
   *  and snapshot mapping used by ordinary KiDraw files. */
  private buildYamlSample(dl: DrawingLayer, yaml: string, sampleId: string): void {
    const parsed = parseGraphDocYaml(yaml);
    if (!parsed.ok) {
      console.error(`${sampleId} sample failed to parse:`, parsed.error);
      return;
    }
    const doc = parsed.value;
    const first = doc.styles?.[0];
    // A StyleRef can be an external path (string); the sample only ever
    // carries an inline style.
    const inline = typeof first === 'object' ? first : undefined;
    const resolved = inline
      ? resolveAndApplyToGraph(doc, inline, () => null)
      : undefined;
    if (resolved && !resolved.ok) {
      console.error(`${sampleId} sample style failed to resolve:`, resolved.error);
      return;
    }
    dl.restoreGraph(filesToSnapshot(doc, resolved?.ok ? resolved.value : {kdStyle: 1}));
  }

  /** The layout stress shape: an 18-way fan with jittered children, four
   *  deeper chains, and mixed node sizes (what makes fan chords clip
   *  siblings). Same construction the layout repros measure against. */
  private buildFanTree(dl: DrawingLayer): void {
    const root = new DANode(0, 0, 'hub');
    dl.addRawNode(root);
    root.resizeBy(160);
    const kids: DANode[] = [];
    for (let i = 0; i < 18; i++) {
      const kid = new DANode((i - 9) * 160, 300 + (i % 3) * 40, `task ${i + 1}`);
      dl.addRawNode(kid);
      dl.addRawEdge(new DAEdge(root, kid, ''));
      kids.push(kid);
    }
    kids[2].resizeBy(120);
    kids[9].resizeBy(120);
    for (let i = 0; i < 4; i++) {
      let parent = kids[i];
      for (let d = 0; d < 3; d++) {
        const child = new DANode(
          parent.konvaGroup.x() + 20, parent.konvaGroup.y() + 180, `sub ${i + 1}.${d + 1}`);
        dl.addRawNode(child);
        dl.addRawEdge(new DAEdge(parent, child, ''));
        parent = child;
      }
    }
  }

  private buildFromDefs(dl: DrawingLayer, nodeDefs: NodeDef[], edgeDefs: EdgeDef[]): void {
    const nodes = nodeDefs.map(def =>
      new DANode(def.x, def.y, def.text, undefined, undefined, def.shape ?? 'box'));
    nodes.forEach(n => dl.addRawNode(n));
    edgeDefs.forEach((e, index) => {
      const edge = new DAEdge(nodes[e.src], nodes[e.dest], '');
      dl.addRawEdge(edge);
      if (e.text) {
        const label = new DALabel(0, 0, e.text);
        label.edgeT = 0.5;
        label.side = index % 2 === 0 ? 'above' : 'below';
        edge.addLabel(label);
        edge.refreshGeometry();
      }
    });
    // Theme colors will be applied by the caller
  }

  private buildBasicFlow(dl: DrawingLayer): void {
    this.buildFromDefs(dl, [
      { x: 100, y: 100, text: 'Start' },
      { x: 300, y: 100, text: 'Process' },
      { x: 500, y: 100, text: 'Decision', shape: 'diamond' },
      { x: 700, y: 100, text: 'End' },
      { x: 300, y: 250, text: 'Action' },
      { x: 500, y: 250, text: 'Result', shape: 'circle' },
    ], [
      { src: 0, dest: 1 },
      { src: 1, dest: 2 },
      { src: 2, dest: 3 },
      { src: 1, dest: 4 },
      { src: 4, dest: 5 },
      { src: 5, dest: 2 },
    ]);
  }

  private buildClassDiagram(dl: DrawingLayer): void {
    // Key classes/interfaces in kidraw
    const col1 = 50, col2 = 250, col3 = 500, col4 = 750;
    const row1 = 50, row2 = 200, row3 = 370, row4 = 540;

    this.buildFromDefs(dl, [
      // Components row
      { x: col1, y: row1, text: 'AppComponent' },         // 0
      { x: col2, y: row1, text: 'DrawingArea\nComponent' },// 1
      { x: col3, y: row1, text: 'Keymenu\nComponent' },    // 2
      { x: col4, y: row1, text: 'Header\nComponent' },     // 3
      // Drawing layer row
      { x: col1, y: row2, text: 'DrawingLayer' },          // 4
      { x: col2, y: row2, text: 'CrosshairsLayer' },       // 5
      { x: col3, y: row2, text: 'KeyMenu<T>' },            // 6
      { x: col4, y: row2, text: 'UndoRedo\nService' },     // 7
      // Domain objects row
      { x: col1, y: row3, text: 'DANode' },                // 8
      { x: col2, y: row3, text: 'DAEdge' },                // 9
      { x: col2 + 150, y: row3, text: 'DACommand' },       // 10
      { x: col3, y: row3, text: 'USQwertyMode' },          // 11
      { x: col4, y: row3, text: 'DACrosshairs' },          // 12
      // Lower row
      { x: col1, y: row4, text: 'DALabel' },               // 13
      { x: col3, y: row4, text: 'KMSubmenu' },             // 14
      { x: col4, y: row4, text: 'KMKey' },                 // 15
    ], [
      // AppComponent → children
      { src: 0, dest: 1 },
      { src: 0, dest: 2 },
      { src: 0, dest: 3 },
      // DrawingAreaComponent → layers
      { src: 1, dest: 4 },
      { src: 1, dest: 5 },
      { src: 1, dest: 7 },
      // KeymenuComponent → KeyMenu
      { src: 2, dest: 6 },
      // DrawingLayer → domain objects
      { src: 4, dest: 8 },
      { src: 4, dest: 9 },
      // CrosshairsLayer → DACrosshairs
      { src: 5, dest: 12 },
      // KeyMenu → USQwertyMode
      { src: 6, dest: 11 },
      // DAEdge → DANode, DALabel
      { src: 9, dest: 8 },
      { src: 9, dest: 13 },
      // KeymenuComponent → DACommand
      { src: 2, dest: 10 },
      // USQwertyMode → KMSubmenu
      { src: 11, dest: 14 },
      // KMSubmenu → KMKey
      { src: 14, dest: 15 },
    ]);
  }

  private buildFileDiagram(dl: DrawingLayer): void {
    const col1 = 100, col2 = 300, col3 = 530;
    const row1 = 50, row2 = 170, row3 = 290, row4 = 410, row5 = 530;

    this.buildFromDefs(dl, [
      // Root
      { x: col1, y: row1, text: 'src/app/' },                // 0
      // Top-level dirs
      { x: col1 - 80, y: row2, text: 'drawing-area/' },      // 1
      { x: col1 + 100, y: row2, text: 'keymenu/' },          // 2
      { x: col2 + 60, y: row2, text: 'lib/keymenu/' },       // 3
      { x: col3, y: row2, text: 'services/' },                // 4
      // drawing-area children
      { x: col1 - 180, y: row3, text: 'da-node.ts' },         // 5
      { x: col1 - 50, y: row3, text: 'da-edge.ts' },          // 6
      { x: col1 - 180, y: row4, text: 'drawing.layer.ts' },   // 7
      { x: col1 - 50, y: row4, text: 'crosshairs.layer.ts' }, // 8
      // keymenu children
      { x: col1 + 100, y: row3, text: 'keymenu\n.component.ts' },  // 9
      { x: col1 + 100, y: row4, text: 'config/\nkey-assignments' },// 10
      // lib/keymenu children
      { x: col2, y: row3, text: 'keyMenu.ts' },                    // 11
      { x: col2 + 130, y: row3, text: 'modes/\nus-qwerty.ts' },    // 12
      { x: col2, y: row4, text: 'keys/\nkmSubmenu.ts' },            // 13
      { x: col2 + 130, y: row4, text: 'keys/\nkmKey.ts' },          // 14
      // services
      { x: col3, y: row3, text: 'theme.service' },            // 15
      { x: col3 + 130, y: row3, text: 'visual-config\n.service' }, // 16
      { x: col3, y: row4, text: 'keyboard-config\n.service' },     // 17
      { x: col3 + 130, y: row4, text: 'debug-log\n.service' },     // 18
    ], [
      { src: 0, dest: 1 },
      { src: 0, dest: 2 },
      { src: 0, dest: 3 },
      { src: 0, dest: 4 },
      { src: 1, dest: 5 },
      { src: 1, dest: 6 },
      { src: 1, dest: 7 },
      { src: 1, dest: 8 },
      { src: 2, dest: 9 },
      { src: 2, dest: 10 },
      { src: 3, dest: 11 },
      { src: 3, dest: 12 },
      { src: 3, dest: 13 },
      { src: 3, dest: 14 },
      { src: 4, dest: 15 },
      { src: 4, dest: 16 },
      { src: 4, dest: 17 },
      { src: 4, dest: 18 },
    ]);
  }

  private buildModeDiagram(dl: DrawingLayer): void {
    // This is deliberately an event/state graph, not a shortcut inventory.
    // It mirrors KeyMenu + USQwertyMode + KeymenuComponent: physical key
    // lifecycle, submenu stack transitions, text-edit modes, and the canvas-
    // owned surfaces that temporarily suspend the ordinary keymenu.
    this.buildFromDefs(dl, [
      // Physical key lifecycle.
      {x: 0, y: 0, text: 'Key up\n(not held)', shape: 'circle'},             // 0
      {x: 300, y: 0, text: 'Fresh bound\nkeydown'},                          // 1
      {x: 600, y: 0, text: 'Held key'},                                      // 2
      {x: 900, y: 0, text: 'Repeat\nscheduled'},                             // 3
      {x: 1200, y: 0, text: 'Unit action\nfired'},                           // 4
      {x: 600, y: 180, text: 'Browser repeat\nignored'},                     // 5

      // Submenu stack (one mode at a time).
      {x: 0, y: 380, text: 'Mode root\npath []', shape: 'circle'},            // 6
      {x: 350, y: 380, text: 'Held submenu\npath [K]'},                       // 7
      {x: 700, y: 380, text: 'Nested submenu\npath [K,L]'},                   // 8
      {x: 1050, y: 380, text: 'Replaced submenu\nsame path [K]'},             // 9

      // User-visible modes.
      {x: 0, y: 760, text: 'normal', shape: 'circle'},                        // 10
      {x: 0, y: 1140, text: 'normalCaps', shape: 'circle'},                   // 11
      {x: 400, y: 760, text: 'labelEdit\nVim normal'},                       // 12
      {x: 400, y: 1140, text: 'labelEdit\nVim normal caps'},                 // 13
      {x: 800, y: 760, text: 'labelEdit\ninsert'},                           // 14
      {x: 800, y: 1140, text: 'labelEdit\ninsert caps'},                     // 15
      {x: 1200, y: 760, text: 'labelEdit\nVim visual'},                      // 16
      {x: 1200, y: 1140, text: 'labelEdit\nVim visual caps'},                // 17

      // Canvas-owned keyboard surfaces (KeymenuComponent is suspended).
      {x: 0, y: 1580, text: 'surface\nnav-popup'},                            // 18
      {x: 300, y: 1580, text: 'surface\ngrow-targeting'},                    // 19
      {x: 600, y: 1580, text: 'surface\ngrow-empty'},                        // 20
      {x: 900, y: 1580, text: 'surface\ngrow-target-popup'},                 // 21
      {x: 1200, y: 1580, text: 'surface\ngrow-type-popup'},                  // 22
      {x: 1500, y: 1580, text: 'surface\ngrow-placement'},                   // 23
    ], [
      // Fresh-press and app-owned repeat lifecycle.
      {src: 0, dest: 1, text: 'keydown K · bound + not already held'},
      {src: 1, dest: 2, text: 'keysDown.add · action once'},
      {src: 2, dest: 3, text: 'repeatable · initial delay'},
      {src: 3, dest: 4, text: 'timer tick'},
      {src: 4, dest: 3, text: 'schedule interval'},
      {src: 2, dest: 0, text: 'keyup K · cancel timer'},
      {src: 3, dest: 0, text: 'keyup K · stop chain'},
      {src: 2, dest: 5, text: 'keydown K with event.repeat'},
      {src: 5, dest: 2, text: 'no action · app timer owns repeat'},

      // Hold, release, prefix-pop, and action replacement.
      {src: 6, dest: 7, text: 'keydown K · submenu binding'},
      {src: 7, dest: 8, text: 'keydown L · submenu binding'},
      {src: 8, dest: 7, text: 'keyup L · pop child'},
      {src: 8, dest: 6, text: 'keyup K · prefix pop'},
      {src: 7, dest: 9, text: 'action transition · replaceTopSubmenu'},
      {src: 9, dest: 6, text: 'keyup K · return root'},

      // Mode switches (non-caps and caps variants are real distinct modes).
      {src: 10, dest: 11, text: 'CapsLock'},
      {src: 11, dest: 10, text: 'CapsLock'},
      {src: 10, dest: 12, text: 'tap i over existing node / label'},
      {src: 10, dest: 14, text: 'add new node / label'},
      {src: 14, dest: 12, text: 'Escape or Ctrl-[ · first press'},
      {src: 12, dest: 14, text: 'i / a / A / I / change'},
      {src: 12, dest: 16, text: 'v'},
      {src: 16, dest: 12, text: 'v / Escape / x / r'},
      {src: 14, dest: 15, text: 'CapsLock'},
      {src: 15, dest: 14, text: 'CapsLock'},
      {src: 12, dest: 13, text: 'CapsLock'},
      {src: 13, dest: 12, text: 'CapsLock'},
      {src: 16, dest: 17, text: 'CapsLock'},
      {src: 17, dest: 16, text: 'CapsLock'},
      {src: 15, dest: 13, text: 'Escape or Ctrl-[ · first press'},
      {src: 17, dest: 13, text: 'v / Escape'},
      {src: 12, dest: 10, text: 'Escape / Ctrl-[ · second press'},
      {src: 13, dest: 11, text: 'Escape / Ctrl-[ · second press'},
      {src: 14, dest: 10, text: 'Shift-Enter / double Shift'},
      {src: 15, dest: 11, text: 'Shift-Enter / double Shift'},

      // DOM/canvas surfaces temporarily replace the active keymenu mode.
      {src: 10, dest: 18, text: 'TRAVERSE_SMART · open popup-state'},
      {src: 18, dest: 10, text: 'commit / cancel · popup-state close'},
      {src: 10, dest: 19, text: 'hold add over node'},
      {src: 10, dest: 20, text: 'hold add over empty canvas'},
      {src: 19, dest: 21, text: '/ · search target'},
      {src: 19, dest: 22, text: 'choose new-node type'},
      {src: 20, dest: 22, text: 'choose new-node type'},
      {src: 22, dest: 23, text: 'type selected'},
      {src: 21, dest: 10, text: 'Enter commit / Escape cancel'},
      {src: 19, dest: 10, text: 'release add · edge commit / cancel'},
      {src: 19, dest: 14, text: 'release pristine · create + edit'},
      {src: 20, dest: 14, text: 'release add · create + edit'},
      {src: 23, dest: 14, text: 'release add / Enter · create + edit'},
    ]);
  }

  // --- Nudge experiment graphs ---

  /** Four pairs of nodes, each connected by 2–4 parallel edges. */
  private buildNudgeMulti(dl: DrawingLayer): void {
    this.buildFromDefs(dl, [
      // Pair 1: 2 edges
      { x: 100, y: 80,  text: 'A' },
      { x: 350, y: 80,  text: 'B' },
      // Pair 2: 3 edges
      { x: 100, y: 220, text: 'C' },
      { x: 350, y: 220, text: 'D' },
      // Pair 3: 4 edges
      { x: 100, y: 370, text: 'E' },
      { x: 350, y: 370, text: 'F' },
      // Pair 4: 2 edges going back the other way (undirected feel)
      { x: 100, y: 510, text: 'G' },
      { x: 350, y: 510, text: 'H' },
    ], [
      { src: 0, dest: 1 }, { src: 0, dest: 1 },
      { src: 2, dest: 3 }, { src: 2, dest: 3 }, { src: 2, dest: 3 },
      { src: 4, dest: 5 }, { src: 4, dest: 5 }, { src: 4, dest: 5 }, { src: 4, dest: 5 },
      { src: 6, dest: 7 }, { src: 7, dest: 6 },
    ]);
  }

  /** A hub node with 8 outgoing edges to destinations arranged in a semicircle.
   *  Several destinations are closely spaced, creating near-parallel edges leaving
   *  the hub. Tests the fan-out case. */
  private buildNudgeFan(dl: DrawingLayer): void {
    const cx = 250, cy = 300, r = 200;
    // Hub
    const nodes: NodeDef[] = [{ x: cx, y: cy, text: 'Hub' }];
    // 8 destinations spread across a semicircle (left half, so edges fan leftward)
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * (0.15 + 0.7 * i / (count - 1));
      nodes.push({
        x: Math.round(cx - r * Math.cos(angle)),
        y: Math.round(cy - r * Math.sin(angle)),
        text: String.fromCharCode(65 + i),
      });
    }
    const edges: EdgeDef[] = nodes.slice(1).map((_, i) => ({ src: 0, dest: i + 1 }));
    this.buildFromDefs(dl, nodes, edges);
  }

  /** Two clusters of source nodes, all funneling through a narrow bottleneck pair,
   *  then spreading to destination nodes. Tests edges that share a long parallel
   *  stretch in the middle. */
  private buildNudgeConverge(dl: DrawingLayer): void {
    this.buildFromDefs(dl, [
      // Left sources (spread vertically)
      { x: 60,  y: 80,  text: 'S1' },
      { x: 60,  y: 180, text: 'S2' },
      { x: 60,  y: 280, text: 'S3' },
      { x: 60,  y: 380, text: 'S4' },
      // Bottleneck pair
      { x: 280, y: 180, text: 'In' },
      { x: 280, y: 280, text: 'Out' },
      // Right destinations (spread vertically)
      { x: 500, y: 80,  text: 'D1' },
      { x: 500, y: 180, text: 'D2' },
      { x: 500, y: 280, text: 'D3' },
      { x: 500, y: 380, text: 'D4' },
    ], [
      // All sources → In
      { src: 0, dest: 4 }, { src: 1, dest: 4 }, { src: 2, dest: 4 }, { src: 3, dest: 4 },
      // In → Out
      { src: 4, dest: 5 },
      // Out → all destinations
      { src: 5, dest: 6 }, { src: 5, dest: 7 }, { src: 5, dest: 8 }, { src: 5, dest: 9 },
    ]);
  }

  // Legacy method for URL parameter demo
  createDemoGraph(drawingLayer: DrawingLayer) {
    this.buildBasicFlow(drawingLayer);
  }
}
