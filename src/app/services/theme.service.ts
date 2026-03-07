import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ThemePalette {
  // Card backgrounds per depth (0 = root, 1 = first submenu, etc.)
  cardBackgrounds: string[];
  // Key rendering
  keyFill: string;
  keyStroke: string;
  keyLabelFill: string;
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
    '#1e293b', // slate-800
    '#1e3a5f', // blue-dark
    '#1a3c34', // green-dark
    '#3b1f4a', // purple-dark
    '#4a2c1a', // brown-dark
  ],
  keyFill: '#334155',       // slate-700
  keyStroke: '#64748b',     // slate-500
  keyLabelFill: '#475569',  // slate-600
  keyLabelText: '#e2e8f0',  // slate-200
  actionText: '#cbd5e1',    // slate-300
  blankKeyFill: '#1e293b',  // slate-800
  blankKeyStroke: '#475569', // slate-600
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
    '#e2e8f0', // slate-200
    '#bfdbfe', // blue-200
    '#bbf7d0', // green-200
    '#e9d5ff', // purple-200
    '#fed7aa', // orange-200
  ],
  keyFill: '#ffffff',
  keyStroke: '#334155',       // slate-700 (softer than pure black)
  keyLabelFill: '#cbd5e1',    // slate-300 (muted, aligns with card tones)
  keyLabelText: '#1e293b',    // slate-800
  actionText: '#1e293b',      // slate-800
  blankKeyFill: '#f1f5f9',   // slate-100
  blankKeyStroke: '#cbd5e1',  // slate-300
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
