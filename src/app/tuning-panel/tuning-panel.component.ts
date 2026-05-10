import { Component, HostListener, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { TuningOptionsService, TuningSlider } from '../services/tuning-options.service';
import { RoutingMetricsService } from '../services/routing-metrics.service';
import { RoutingMetrics } from '../drawing-area/edge-routing-metrics';
import { ABTestingService, Snapshot } from '../services/ab-testing.service';

@Component({
  selector: 'app-tuning-panel',
  imports: [AsyncPipe],
  templateUrl: './tuning-panel.component.html',
  styleUrl: './tuning-panel.component.css',
})
export class TuningPanelComponent {
  tuning = inject(TuningOptionsService);
  metricsService = inject(RoutingMetricsService);
  abTesting = inject(ABTestingService);

  collapsed = false;
  selectedAId: string | null = null;
  selectedBId: string | null = null;

  takeSnapshot(): void {
    this.abTesting.requestSnapshot();
  }

  selectForA(id: string): void {
    this.selectedAId = this.selectedAId === id ? null : id;
  }

  selectForB(id: string): void {
    this.selectedBId = this.selectedBId === id ? null : id;
  }

  openCompare(): void {
    if (!this.selectedAId || !this.selectedBId) return;
    if (this.selectedAId === this.selectedBId) return;
    this.abTesting.openCompare(this.selectedAId, this.selectedBId);
  }

  removeSnapshot(id: string): void {
    if (this.selectedAId === id) this.selectedAId = null;
    if (this.selectedBId === id) this.selectedBId = null;
    this.abTesting.removeSnapshot(id);
  }

  exportPicks(): void {
    this.download('routing-picks.json', this.abTesting.exportPicksJSON());
  }

  exportFull(): void {
    this.download('routing-ab-data.json', this.abTesting.exportFullJSON());
  }

  trackSnap = (_: number, s: Snapshot) => s.id;

  /** Capture an explicit window-level keydown when the compare modal is
   *  open. ← picks A, → picks B, Esc closes. We listen on `window` so
   *  these don't have to fight the keymenu component for focus. */
  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    const cmp = this.abTesting.compare$.value;
    if (!cmp) return;
    if (e.key === 'Escape') {
      this.abTesting.closeCompare();
      e.stopPropagation();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      this.abTesting.recordPick(cmp.a.id, cmp.b.id);
      this.abTesting.closeCompare();
      e.stopPropagation();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      this.abTesting.recordPick(cmp.b.id, cmp.a.id);
      this.abTesting.closeCompare();
      e.stopPropagation();
      e.preventDefault();
    }
  }

  private download(filename: string, content: string): void {
    const blob = new Blob([content], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  formatComposite(m: RoutingMetrics): string {
    if (m.composite === -Infinity) return '−∞ (hard fail)';
    return m.composite.toFixed(1);
  }

  formatNum(v: number, digits = 1): string {
    if (!isFinite(v)) return '—';
    return v.toFixed(digits);
  }

  get bezierSliders(): TuningSlider[] {
    return this.tuning.sliders.filter(s => s.group === 'bezier-route');
  }

  get chargedSpringSliders(): TuningSlider[] {
    return this.tuning.sliders.filter(s => s.group === 'charged-spring');
  }

  get bezierFitSliders(): TuningSlider[] {
    return this.tuning.sliders.filter(s => s.group === 'bezier-fit');
  }

  get flexibleWireSliders(): TuningSlider[] {
    return this.tuning.sliders.filter(s => s.group === 'flexible-wire');
  }

  get weightedChainSliders(): TuningSlider[] {
    return this.tuning.sliders.filter(s => s.group === 'weighted-chain');
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
