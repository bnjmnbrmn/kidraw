import { Component, computed, EventEmitter, inject, Output } from '@angular/core';
import { ThemeService, ThemePalette } from '../services/theme.service';
import { KeyboardConfigService, KeyProfile } from '../services/keyboard-config.service';
import { KeyboardLayout } from '../lib/keymenu/layouts/us-qwerty';
import { VisualConfigService } from '../services/visual-config.service';
import { VisualConfig } from '../services/visual-config.model';
import { DemoDataService } from '../services/demo-data.service';
import { EdgeDirectedness, LineStyle, NodeShape } from '../drawing-area/command.model';
import { GraphStorageService, SavedGraph } from '../services/graph-storage.service';
import { GraphSnapshot } from '../drawing-area/graph-snapshot';

/** Palette fields that are simple hex colors (not arrays or rgba). */
const SIMPLE_COLOR_FIELDS: { key: keyof ThemePalette; label: string }[] = [
  { key: 'keymenuStageBackground', label: 'Menu background' },
  { key: 'drawingStageBackground', label: 'Drawing background' },
  { key: 'keyLabelText', label: 'Key label text' },
  { key: 'actionText', label: 'Action text' },
  { key: 'blankKeyFill', label: 'Blank key fill' },
  { key: 'blankKeyStroke', label: 'Blank key stroke' },
  { key: 'highlightShadowColor', label: 'Highlight glow' },
  { key: 'labelEditCardBackground', label: 'Label-edit card bg' },
  { key: 'labelEditKeyFill', label: 'Label-edit key fill' },
  { key: 'labelEditKeyStroke', label: 'Label-edit key stroke' },
  { key: 'labelEditText', label: 'Label-edit text' },
  { key: 'nodeFill', label: 'Node fill' },
  { key: 'nodeStroke', label: 'Node stroke' },
  { key: 'nodeText', label: 'Node text' },
  { key: 'edgeStroke', label: 'Edge stroke' },
  { key: 'edgeFill', label: 'Edge fill' },
  { key: 'labelFill', label: 'Label fill' },
  { key: 'labelStroke', label: 'Label stroke' },
  { key: 'labelText', label: 'Label text' },
  { key: 'crosshairsStroke', label: 'Crosshairs' },
  { key: 'instructionText', label: 'Instruction text' },
];

const ARRAY_COLOR_FIELDS: { key: keyof ThemePalette; label: string }[] = [
  { key: 'cardBackgrounds', label: 'Card backgrounds' },
  { key: 'keyFills', label: 'Key fills' },
  { key: 'keyStrokes', label: 'Key strokes' },
  { key: 'keyLabelFills', label: 'Key label fills' },
];

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  zoomLevel: number = 100;
  mode: 'normal' | 'labelEdit' | 'labelEditVimNormal' = 'normal';
  statusMessage: string = '';
  private statusMessageTimer?: number;
  selectionSummary: string = '';
  totalNodes: number = 0;
  totalEdges: number = 0;
  defaultNodeShape: NodeShape = 'box';
  defaultEdgeDirectedness: EdgeDirectedness = 'undirected';
  defaultLineStyle: LineStyle = 'solid';
  canUndo: boolean = false;
  canRedo: boolean = false;
  /** "vaultDir/path" for vault-backed graphs (auto-saving), a filename for
   *  picker-opened files, or null when the graph has no file backing. */
  openFileLabel: string | null = null;

  /** The header always names the graph being edited, even before it has a
   *  backing file. */
  get workingFileLabel(): string {
    return this.openFileLabel ?? 'Untitled';
  }

  get graphStats(): string {
    if (this.totalNodes === 0 && this.totalEdges === 0) return 'empty';
    const parts: string[] = [];
    if (this.totalNodes > 0) parts.push(`${this.totalNodes}n`);
    if (this.totalEdges > 0) parts.push(`${this.totalEdges}e`);
    return parts.join(' ');
  }

  get directednessSymbol(): string {
    switch (this.defaultEdgeDirectedness) {
      case 'directed': return '→';
      case 'undirected': return '—';
      case 'bidirectional': return '↔';
    }
  }

  get nodeShapeLabel(): string {
    switch (this.defaultNodeShape) {
      case 'box': return 'Box';
      case 'circle': return 'Circle';
      case 'diamond': return 'Diamond';
      case 'junction': return '•';
      case 'invisible': return 'Invis';
    }
  }

  get lineStyleSymbol(): string {
    switch (this.defaultLineStyle) {
      case 'solid': return '—';
      case 'dashed': return '- -';
      case 'dotted': return '···';
    }
  }

  @Output() loadSampleGraph = new EventEmitter<string>();
  @Output() saveGraphAs = new EventEmitter<string>();
  @Output() loadNamedGraph = new EventEmitter<{graphId: string; graphSnapshot: GraphSnapshot}>();

  themeService = inject(ThemeService);
  keyboardConfig = inject(KeyboardConfigService);
  vc = inject(VisualConfigService);
  demoData = inject(DemoDataService);
  graphStorage = inject(GraphStorageService);

  savedGraphs = computed(() => this.graphStorage.graphs());
  renamingId: string | null = null;
  renamingName: string = '';
  myGraphsOpen = false;

  readonly simpleColorFields = SIMPLE_COLOR_FIELDS;
  readonly arrayColorFields = ARRAY_COLOR_FIELDS;
  readonly depthIndices = [0, 1, 2, 3, 4, 5];

  showStatusMessage(message: string, durationMs = 2500): void {
    this.statusMessage = message;
    if (this.statusMessageTimer) window.clearTimeout(this.statusMessageTimer);
    this.statusMessageTimer = window.setTimeout(() => {
      this.statusMessage = '';
    }, durationMs);
  }

  onZoomLevelChange(level: number) {
    this.zoomLevel = level;
  }

  onThemeChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as 'dark' | 'light';
    this.themeService.setTheme(value);
  }

  onCapsLockSwapChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.keyboardConfig.capsLockCtrlSwap = checked;
  }

  onHideFingerBlockedChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.keyboardConfig.hideFingerBlockedKeys = checked;
  }

  onLayoutChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as KeyboardLayout;
    this.keyboardConfig.keyboardLayout = value;
  }

  onKeyProfileChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as KeyProfile;
    this.keyboardConfig.keyProfile = value;
  }

  get config(): VisualConfig {
    return this.vc.config;
  }

  get palette(): ThemePalette {
    return this.vc.getEffectivePalette(this.themeService.theme);
  }

  onNumberChange(section: 'slideAnimation' | 'cardDepth' | 'cardShadow' | 'cursor', field: string, event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (isNaN(value)) return;
    this.vc.updateConfig({ [section]: { [field]: value } });
  }

  onColorChange(field: keyof ThemePalette, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.vc.updatePalette(this.themeService.theme, { [field]: value } as Partial<ThemePalette>);
  }

  onArrayColorChange(field: keyof ThemePalette, index: number, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const current = [...(this.palette[field] as string[])];
    current[index] = value;
    this.vc.updatePalette(this.themeService.theme, { [field]: current } as Partial<ThemePalette>);
  }

  onShadowColorChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.vc.updatePalette(this.themeService.theme, { cardShadowColor: value });
  }

  onSampleGraphChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    if (value) {
      this.loadSampleGraph.emit(value);
      select.value = '';
      select.blur();
    }
  }

  restoreDefaults() {
    this.vc.resetToDefaults();
  }

  toNum(event: Event): number {
    return parseFloat((event.target as HTMLInputElement).value);
  }
}
