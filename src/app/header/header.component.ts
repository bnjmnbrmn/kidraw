import { Component, EventEmitter, inject, Output } from '@angular/core';
import { ThemeService, ThemePalette } from '../services/theme.service';
import { KeyboardConfigService, KeyProfile } from '../services/keyboard-config.service';
import { KeyboardLayout } from '../lib/keymenu/layouts/us-qwerty';
import { VisualConfigService } from '../services/visual-config.service';
import { VisualConfig } from '../services/visual-config.model';
import { DemoDataService } from '../services/demo-data.service';

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
  mode: 'normal' | 'labelEdit' = 'normal';

  @Output() loadSampleGraph = new EventEmitter<string>();

  themeService = inject(ThemeService);
  keyboardConfig = inject(KeyboardConfigService);
  vc = inject(VisualConfigService);
  demoData = inject(DemoDataService);

  readonly simpleColorFields = SIMPLE_COLOR_FIELDS;
  readonly arrayColorFields = ARRAY_COLOR_FIELDS;
  readonly depthIndices = [0, 1, 2, 3, 4, 5];

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
