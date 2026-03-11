import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ThemePalette {
  // Card backgrounds per depth (0 = root, 1 = first submenu, etc.)
  cardBackgrounds: string[];
  // Key rendering (per-depth arrays parallel to cardBackgrounds; last entry repeats for deeper levels)
  keyFills: string[];
  keyStrokes: string[];
  keyLabelFills: string[];
  keyLabelText: string;
  actionText: string;
  // Blank (unbound) key
  blankKeyFill: string;
  blankKeyStroke: string;
  // Highlight
  highlightShadowColor: string;
  // Label edit card
  labelEditCardBackground: string;
  labelEditKeyFill: string;
  labelEditKeyStroke: string;
  labelEditText: string;
  // Stage/canvas
  keymenuStageBackground: string;
  drawingStageBackground: string;
  // Card shadow
  cardShadowColor: string;
  // Drawing area domain objects
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  edgeStroke: string;
  edgeFill: string;        // arrow pointer fill
  labelFill: string;
  labelStroke: string;
  labelText: string;
  waypointFill: string;
  waypointStroke: string;
  // Instruction text
  instructionText: string;
}

const DARK_PALETTE: ThemePalette = {
  cardBackgrounds: [
    '#1e293b', // slate-800  (root)
    '#1e3455', // slate→blue (depth 1)
    '#1e2f6e', // blue       (depth 2)
    '#2b2470', // indigo     (depth 3)
    '#3b1f6e', // violet     (depth 4)
    '#4a1a5e', // purple     (depth 5)
  ],
  keyFills: [
    '#334155',  // slate-700     (depth 0)
    '#2d3f66',  // slate→blue    (depth 1)
    '#2d3a7a',  // blue          (depth 2)
    '#38307c',  // indigo        (depth 3)
    '#48307a',  // violet        (depth 4)
    '#55286a',  // purple        (depth 5)
  ],
  keyStrokes: [
    '#64748b',  // slate-500     (depth 0)
    '#5b7199',  // blue-muted    (depth 1)
    '#5565a8',  // blue          (depth 2)
    '#6558a8',  // indigo        (depth 3)
    '#7555a5',  // violet        (depth 4)
    '#854f95',  // purple        (depth 5)
  ],
  keyLabelFills: [
    '#475569',  // slate-600     (depth 0)
    '#3d4f76',  // slate→blue    (depth 1)
    '#3d4a8a',  // blue          (depth 2)
    '#483f8c',  // indigo        (depth 3)
    '#583f8a',  // violet        (depth 4)
    '#65387a',  // purple        (depth 5)
  ],
  keyLabelText: '#e2e8f0',  // slate-200
  actionText: '#cbd5e1',    // slate-300
  blankKeyFill: '#232f42',  // barely lighter than card bg
  blankKeyStroke: '#2d3d52', // very dim, just enough to see the key shape
  highlightShadowColor: '#38bdf8', // sky-400
  labelEditCardBackground: '#1e293b',
  labelEditKeyFill: '#334155',
  labelEditKeyStroke: '#64748b',
  labelEditText: '#e2e8f0',
  keymenuStageBackground: '#0f172a', // slate-900
  drawingStageBackground: '#1e293b', // slate-800, lighter than keymenu
  cardShadowColor: 'rgba(0, 0, 0, 0.5)',
  nodeFill: '#334155',      // slate-700
  nodeStroke: '#94a3b8',    // slate-400
  nodeText: '#e2e8f0',      // slate-200
  edgeStroke: '#94a3b8',    // slate-400
  edgeFill: '#94a3b8',      // slate-400
  labelFill: '#334155',     // slate-700
  labelStroke: '#60a5fa',   // blue-400
  labelText: '#e2e8f0',     // slate-200
  waypointFill: '#334155',  // slate-700
  waypointStroke: '#60a5fa',// blue-400
  instructionText: '#94a3b8', // slate-400
};

const LIGHT_PALETTE: ThemePalette = {
  cardBackgrounds: [
    '#e2e8f0', // slate-200  (root)
    '#dbeafe', // blue-100   (depth 1)
    '#c7d2fe', // indigo-200 (depth 2)
    '#c4b5fd', // violet-300 (depth 3)
    '#d8b4fe', // purple-300 (depth 4)
    '#e9d5ff', // purple-200 (depth 5)
  ],
  keyFills: [
    '#ffffff',  // white         (depth 0)
    '#eef4ff',  // blue tint     (depth 1)
    '#eef0ff',  // indigo tint   (depth 2)
    '#f3eeff',  // violet tint   (depth 3)
    '#f5ecff',  // purple tint   (depth 4)
    '#f9f0ff',  // purple-light  (depth 5)
  ],
  keyStrokes: [
    '#334155',  // slate-700     (depth 0)
    '#335577',  // blue-muted    (depth 1)
    '#4444aa',  // indigo        (depth 2)
    '#5533aa',  // violet        (depth 3)
    '#6633aa',  // purple        (depth 4)
    '#773399',  // purple-dark   (depth 5)
  ],
  keyLabelFills: [
    '#cbd5e1',  // slate-300     (depth 0)
    '#bfdbfe',  // blue-200      (depth 1)
    '#c7d2fe',  // indigo-200    (depth 2)
    '#ddd6fe',  // violet-200    (depth 3)
    '#e9d5ff',  // purple-200    (depth 4)
    '#f3e8ff',  // purple-100    (depth 5)
  ],
  keyLabelText: '#1e293b',    // slate-800
  actionText: '#1e293b',      // slate-800
  blankKeyFill: '#dde3ec',   // barely darker than card bg
  blankKeyStroke: '#c8d0da',  // very dim outline
  highlightShadowColor: '#000000',
  labelEditCardBackground: '#e2e8f0',
  labelEditKeyFill: '#ffffff',
  labelEditKeyStroke: '#334155',
  labelEditText: '#1e293b',
  keymenuStageBackground: '#94a3b8', // slate-400, distinct from drawing
  drawingStageBackground: '#f8fafc', // slate-50, light and clean
  cardShadowColor: 'rgba(0, 0, 0, 0.25)',
  nodeFill: '#ffffff',
  nodeStroke: '#334155',     // slate-700
  nodeText: '#1e293b',       // slate-800
  edgeStroke: '#334155',     // slate-700
  edgeFill: '#334155',       // slate-700
  labelFill: '#ffffff',
  labelStroke: '#2563eb',    // blue-600
  labelText: '#1e293b',      // slate-800
  waypointFill: '#ffffff',
  waypointStroke: '#2563eb', // blue-600
  instructionText: '#374151', // gray-700
};

export type ThemeName = 'dark' | 'light';

const STORAGE_KEY = 'kidraw-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _theme: ThemeName;
  private _themeChanged = new Subject<ThemeName>();
  readonly themeChanged$ = this._themeChanged.asObservable();

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
    this._theme = stored === 'light' || stored === 'dark' ? stored : 'light';
    this.applyTheme();
  }

  get theme(): ThemeName {
    return this._theme;
  }

  get palette(): ThemePalette {
    return this._theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  }

  toggleTheme(): void {
    this._theme = this._theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, this._theme);
    this.applyTheme();
  }

  setTheme(theme: ThemeName): void {
    this._theme = theme;
    localStorage.setItem(STORAGE_KEY, this._theme);
    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this._theme);
    this._themeChanged.next(this._theme);
  }
}
