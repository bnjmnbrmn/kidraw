import { Injectable } from '@angular/core';
import { DANode } from '../drawing-area/da-node';
import { DAEdge } from '../drawing-area/da-edge';
import { DrawingLayer } from '../drawing-area/drawing.layer';
import { NodeShape } from '../drawing-area/command.model';

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
}

@Injectable({
  providedIn: 'root'
})
export class DemoDataService {

  readonly sampleGraphs: SampleGraphDef[] = [
    { id: 'basic', label: 'Basic Flow' },
    { id: 'classes', label: 'Kidraw Classes' },
    { id: 'files', label: 'Project Files' },
    { id: 'modes', label: 'Mode / Shortcut Hierarchy' },
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
      case 'classes': return dl => this.buildClassDiagram(dl);
      case 'files': return dl => this.buildFileDiagram(dl);
      case 'modes': return dl => this.buildModeDiagram(dl);
      default: return undefined;
    }
  }

  private buildFromDefs(dl: DrawingLayer, nodeDefs: NodeDef[], edgeDefs: EdgeDef[]): void {
    const nodes = nodeDefs.map(def =>
      new DANode(def.x, def.y, def.text, undefined, undefined, def.shape ?? 'box'));
    nodes.forEach(n => dl.addRawNode(n));
    edgeDefs.forEach(e => {
      const edge = new DAEdge(nodes[e.src], nodes[e.dest], '');
      dl.addRawEdge(edge);
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
      { x: col2 + 150, y: row3, text: 'DAWaypoint' },      // 10
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
      // DAEdge → DANode, DAWaypoint, DALabel
      { src: 9, dest: 8 },
      { src: 9, dest: 10 },
      { src: 9, dest: 13 },
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
    const col1 = 100, col2 = 350, col3 = 600;
    const row1 = 50, row2 = 200, row3 = 350, row4 = 500;

    this.buildFromDefs(dl, [
      // Top-level modes
      { x: col1, y: row1, text: 'Normal Mode' },             // 0
      { x: col2, y: row1, text: 'Label Edit\nMode' },        // 1
      { x: col3, y: row1, text: 'Label Edit\nCaps Mode' },   // 2
      // Normal mode submenus
      { x: col1 - 100, y: row2, text: 'Insert...\n(f)' },    // 3
      { x: col1 + 30, y: row2, text: 'Edit...\n(i)' },       // 4
      { x: col1 + 160, y: row2, text: 'Select+Drag\n(v)' },  // 5
      { x: col2 - 60, y: row2, text: 'Pan/Zoom\n(r)' },      // 6
      { x: col2 + 80, y: row2, text: 'Move by\nNode (g)' },  // 7
      { x: col3 - 60, y: row2, text: 'Bigger\nMove (s)' },   // 8
      { x: col3 + 70, y: row2, text: 'Shape...\n(t)' },      // 9
      // Insert children
      { x: col1 - 170, y: row3, text: 'Node\n(d)' },         // 10
      { x: col1 - 60, y: row3, text: 'Waypoint\n(w)' },      // 11
      { x: col1 + 50, y: row3, text: 'Edge\n(e)' },          // 12
      { x: col1 + 150, y: row3, text: 'Label\n(l)' },        // 13
      // Edit children
      { x: col2 - 50, y: row3, text: 'Overflow...\n(o)' },   // 14
      // Pan/Zoom children
      { x: col2 + 80, y: row3, text: 'Zoom In/Out' },        // 15
      { x: col3 - 60, y: row3, text: 'Recenter' },           // 16
      // Label edit submenus
      { x: col2, y: row4, text: 'Shift...' },                 // 17
      { x: col3, y: row4, text: 'CapsLock\ntoggle' },         // 18
    ], [
      // Mode transitions
      { src: 0, dest: 1 },  // normal → labelEdit (via insert or edit)
      { src: 1, dest: 2 },  // labelEdit ↔ labelEditCaps
      { src: 2, dest: 1 },
      // Normal submenus
      { src: 0, dest: 3 },
      { src: 0, dest: 4 },
      { src: 0, dest: 5 },
      { src: 0, dest: 6 },
      { src: 0, dest: 7 },
      { src: 0, dest: 8 },
      { src: 0, dest: 9 },
      // Insert children
      { src: 3, dest: 10 },
      { src: 3, dest: 11 },
      { src: 3, dest: 12 },
      { src: 3, dest: 13 },
      // Edit children
      { src: 4, dest: 14 },
      // Pan/Zoom children
      { src: 6, dest: 15 },
      { src: 6, dest: 16 },
      // Label edit submenus
      { src: 1, dest: 17 },
      { src: 1, dest: 18 },
    ]);
  }

  // Legacy method for URL parameter demo
  createDemoGraph(drawingLayer: DrawingLayer) {
    this.buildBasicFlow(drawingLayer);
  }
}
