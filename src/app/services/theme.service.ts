import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ThemePalette {
  cardBackgrounds: string[];
  keyFills: string[];
  keyStrokes: string[];
  keyLabelFills: string[];
  keyLabelText: string;
  actionText: string;
  blankKeyFill: string;
  blankKeyStroke: string;
  highlightShadowColor: string;
  labelEditCardBackground: string;
  labelEditKeyFill: string;
  labelEditKeyStroke: string;
  labelEditText: string;
  keymenuStageBackground: string;
  drawingStageBackground: string;
  cardShadowColor: string;
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  edgeStroke: string;
  edgeFill: string;
  labelFill: string;
  labelStroke: string;
  labelText: string;
  crosshairsStroke: string;
  instructionText: string;
}

export const DEFAULT_DARK_PALETTE: ThemePalette = {
  cardBackgrounds: ['#2a2a2a','#3c3c3c','#4e4e4e','#606060','#727272','#848484'],
  keyFills: ['#1a1a1a','#2c2c2c','#3e3e3e','#505050','#626262','#747474'],
  keyStrokes: ['#707070','#808080','#909090','#a0a0a0','#b0b0b0','#c0c0c0'],
  keyLabelFills: ['#505050','#626262','#747474','#868686','#989898','#aaaaaa'],
  keyLabelText: '#f0f0f0',
  actionText: '#e8e8e8',
  blankKeyFill: '#1e1e1e',
  blankKeyStroke: '#404040',
  highlightShadowColor: '#ffffff',
  labelEditCardBackground: '#1e1e1e',
  labelEditKeyFill: '#2a2a2a',
  labelEditKeyStroke: '#707070',
  labelEditText: '#f0f0f0',
  keymenuStageBackground: '#111111',
  drawingStageBackground: '#050505',
  cardShadowColor: 'rgba(0, 0, 0, 0.8)',
  nodeFill: '#1a1a1a',
  nodeStroke: '#b0b0b0',
  nodeText: '#f0f0f0',
  edgeStroke: '#b0b0b0',
  edgeFill: '#b0b0b0',
  labelFill: '#1a1a1a',
  labelStroke: '#c0c0c0',
  labelText: '#f0f0f0',
  crosshairsStroke: '#f0f0f0',
  instructionText: '#b0b0b0',
};

export const DEFAULT_LIGHT_PALETTE: ThemePalette = {
  cardBackgrounds: ['#e2e8f0','#dbeafe','#c7d2fe','#c4b5fd','#d8b4fe','#e9d5ff'],
  keyFills: ['#ffffff','#eef4ff','#eef0ff','#f3eeff','#f5ecff','#f9f0ff'],
  keyStrokes: ['#334155','#335577','#4444aa','#5533aa','#6633aa','#773399'],
  keyLabelFills: ['#cbd5e1','#bfdbfe','#c7d2fe','#ddd6fe','#e9d5ff','#f3e8ff'],
  keyLabelText: '#1e293b',
  actionText: '#1e293b',
  blankKeyFill: '#dde3ec',
  blankKeyStroke: '#c8d0da',
  highlightShadowColor: '#000000',
  labelEditCardBackground: '#e2e8f0',
  labelEditKeyFill: '#ffffff',
  labelEditKeyStroke: '#334155',
  labelEditText: '#1e293b',
  keymenuStageBackground: '#94a3b8',
  drawingStageBackground: '#f8fafc',
  cardShadowColor: 'rgba(0, 0, 0, 0.25)',
  nodeFill: '#ffffff',
  nodeStroke: '#334155',
  nodeText: '#1e293b',
  edgeStroke: '#334155',
  edgeFill: '#334155',
  labelFill: '#ffffff',
  labelStroke: '#2563eb',
  labelText: '#1e293b',
  crosshairsStroke: '#1e293b',
  instructionText: '#374151',
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
    return this._theme === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE;
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
