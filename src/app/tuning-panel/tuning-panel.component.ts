import { Component, inject } from '@angular/core';
import { TuningOptionsService, TuningSlider } from '../services/tuning-options.service';

@Component({
  selector: 'app-tuning-panel',
  imports: [],
  templateUrl: './tuning-panel.component.html',
  styleUrl: './tuning-panel.component.css',
})
export class TuningPanelComponent {
  tuning = inject(TuningOptionsService);

  collapsed = false;

  get bezierSliders(): TuningSlider[] {
    return this.tuning.sliders.filter(s => s.group === 'bezier-route');
  }

  get chargedSpringSliders(): TuningSlider[] {
    return this.tuning.sliders.filter(s => s.group === 'charged-spring');
  }

  get bezierFitSliders(): TuningSlider[] {
    return this.tuning.sliders.filter(s => s.group === 'bezier-fit');
  }

  onSliderChange(slider: TuningSlider, event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) return;
    this.tuning.setValue(slider, value);
  }

  onNumberChange(slider: TuningSlider, event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) return;
    this.tuning.setValue(slider, value);
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }

  formatValue(slider: TuningSlider): string {
    const v = this.tuning.getValue(slider);
    return slider.integer ? String(Math.round(v)) : v.toFixed(slider.step >= 1 ? 0 : 2);
  }
}
