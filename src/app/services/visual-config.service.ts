import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ThemePalette, ThemeName, DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE } from './theme.service';
import { VisualConfig, DEFAULT_VISUAL_CONFIG } from './visual-config.model';

const VISUAL_CONFIG_KEY = 'kidraw-visual-config';
const DARK_PALETTE_KEY = 'kidraw-dark-palette';
const LIGHT_PALETTE_KEY = 'kidraw-light-palette';

@Injectable({ providedIn: 'root' })
export class VisualConfigService {
  private _config: VisualConfig;
  private _darkPaletteOverrides: Partial<ThemePalette>;
  private _lightPaletteOverrides: Partial<ThemePalette>;
  private _configChanged = new Subject<void>();
  readonly configChanged$ = this._configChanged.asObservable();

  constructor() {
    this._config = this.loadConfig();
    this._darkPaletteOverrides = this.loadPaletteOverrides(DARK_PALETTE_KEY);
    this._lightPaletteOverrides = this.loadPaletteOverrides(LIGHT_PALETTE_KEY);
  }

  get config(): VisualConfig {
    return this._config;
  }

  updateConfig(partial: Partial<VisualConfig>) {
    this._config = {
      slideAnimation: { ...this._config.slideAnimation, ...partial.slideAnimation },
      cardDepth: { ...this._config.cardDepth, ...partial.cardDepth },
      cardShadow: { ...this._config.cardShadow, ...partial.cardShadow },
      cursor: { ...this._config.cursor, ...partial.cursor },
    };
    this.saveConfig();
    this._configChanged.next();
  }

  getEffectivePalette(theme: ThemeName): ThemePalette {
    const base = theme === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE;
    const overrides = theme === 'dark' ? this._darkPaletteOverrides : this._lightPaletteOverrides;
    return { ...base, ...overrides };
  }

  getPaletteOverrides(theme: ThemeName): Partial<ThemePalette> {
    return theme === 'dark' ? { ...this._darkPaletteOverrides } : { ...this._lightPaletteOverrides };
  }

  updatePalette(theme: ThemeName, overrides: Partial<ThemePalette>) {
    if (theme === 'dark') {
      this._darkPaletteOverrides = { ...this._darkPaletteOverrides, ...overrides };
      localStorage.setItem(DARK_PALETTE_KEY, JSON.stringify(this._darkPaletteOverrides));
    } else {
      this._lightPaletteOverrides = { ...this._lightPaletteOverrides, ...overrides };
      localStorage.setItem(LIGHT_PALETTE_KEY, JSON.stringify(this._lightPaletteOverrides));
    }
    this._configChanged.next();
  }

  resetToDefaults() {
    this._config = structuredClone(DEFAULT_VISUAL_CONFIG);
    this._darkPaletteOverrides = {};
    this._lightPaletteOverrides = {};
    localStorage.removeItem(VISUAL_CONFIG_KEY);
    localStorage.removeItem(DARK_PALETTE_KEY);
    localStorage.removeItem(LIGHT_PALETTE_KEY);
    this._configChanged.next();
  }

  private loadConfig(): VisualConfig {
    const stored = localStorage.getItem(VISUAL_CONFIG_KEY);
    if (!stored) return structuredClone(DEFAULT_VISUAL_CONFIG);
    try {
      const parsed = JSON.parse(stored);
      return {
        slideAnimation: { ...DEFAULT_VISUAL_CONFIG.slideAnimation, ...parsed.slideAnimation },
        cardDepth: { ...DEFAULT_VISUAL_CONFIG.cardDepth, ...parsed.cardDepth },
        cardShadow: { ...DEFAULT_VISUAL_CONFIG.cardShadow, ...parsed.cardShadow },
        cursor: { ...DEFAULT_VISUAL_CONFIG.cursor, ...parsed.cursor },
      };
    } catch {
      return structuredClone(DEFAULT_VISUAL_CONFIG);
    }
  }

  private saveConfig() {
    localStorage.setItem(VISUAL_CONFIG_KEY, JSON.stringify(this._config));
  }

  private loadPaletteOverrides(key: string): Partial<ThemePalette> {
    const stored = localStorage.getItem(key);
    if (!stored) return {};
    try {
      return JSON.parse(stored);
    } catch {
      return {};
    }
  }
}
