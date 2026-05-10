import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RoutingMetrics } from '../drawing-area/edge-routing-metrics';

export interface SnapshotPayload {
  algorithm: string;
  params: Record<string, any>;
  metrics: RoutingMetrics;
  pngDataUrl: string;
  graphSerialized: string;
}

export interface Snapshot extends SnapshotPayload {
  id: string;
  timestamp: number;
  label: string;
}

export interface PickRecord {
  timestamp: number;
  winnerId: string;
  loserId: string;
  winnerAlgorithm: string;
  loserAlgorithm: string;
  winnerMetrics: RoutingMetrics;
  loserMetrics: RoutingMetrics;
  comment?: string;
}

/** Holds A/B-comparison snapshots and pick records.
 *
 *  Drawing-area registers a `captureFn` that captures the current Konva
 *  stage as a PNG along with the active routing's metadata. The tuning
 *  panel (or anything else) calls `requestSnapshot()` to add a new entry.
 *  When the user picks two snapshots and chooses a winner, the pick is
 *  logged. Picks can be exported as JSON for offline weight-fitting. */
@Injectable({ providedIn: 'root' })
export class ABTestingService {
  private _snapshots: Snapshot[] = [];
  private _picks: PickRecord[] = [];
  private captureFn?: () => SnapshotPayload | null;

  readonly snapshots$ = new BehaviorSubject<Snapshot[]>([]);
  readonly picks$ = new BehaviorSubject<PickRecord[]>([]);

  /** Pair currently being compared in the modal — null means modal closed. */
  readonly compare$ = new BehaviorSubject<{a: Snapshot; b: Snapshot} | null>(null);

  registerCapture(fn: () => SnapshotPayload | null): void {
    this.captureFn = fn;
  }

  requestSnapshot(label?: string): Snapshot | null {
    if (!this.captureFn) return null;
    const payload = this.captureFn();
    if (!payload) return null;
    const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const snap: Snapshot = {
      ...payload,
      id,
      timestamp: Date.now(),
      label: label ?? this.defaultLabel(payload),
    };
    this._snapshots = [...this._snapshots, snap];
    this.snapshots$.next(this._snapshots);
    return snap;
  }

  removeSnapshot(id: string): void {
    this._snapshots = this._snapshots.filter(s => s.id !== id);
    this.snapshots$.next(this._snapshots);
  }

  clearSnapshots(): void {
    this._snapshots = [];
    this.snapshots$.next([]);
  }

  openCompare(aId: string, bId: string): void {
    const a = this._snapshots.find(s => s.id === aId);
    const b = this._snapshots.find(s => s.id === bId);
    if (a && b) this.compare$.next({a, b});
  }

  closeCompare(): void {
    this.compare$.next(null);
  }

  recordPick(winnerId: string, loserId: string, comment?: string): void {
    const w = this._snapshots.find(s => s.id === winnerId);
    const l = this._snapshots.find(s => s.id === loserId);
    if (!w || !l) return;
    this._picks = [...this._picks, {
      timestamp: Date.now(),
      winnerId, loserId,
      winnerAlgorithm: w.algorithm, loserAlgorithm: l.algorithm,
      winnerMetrics: w.metrics, loserMetrics: l.metrics,
      comment,
    }];
    this.picks$.next(this._picks);
  }

  clearPicks(): void {
    this._picks = [];
    this.picks$.next([]);
  }

  exportPicksJSON(): string {
    return JSON.stringify(this._picks, null, 2);
  }

  exportFullJSON(): string {
    return JSON.stringify({
      snapshots: this._snapshots,
      picks: this._picks,
    }, null, 2);
  }

  private defaultLabel(p: SnapshotPayload): string {
    const score = p.metrics.composite === -Infinity ? 'fail' : p.metrics.composite.toFixed(0);
    const ts = new Date().toISOString().slice(11, 19);
    return `${p.algorithm} ${score} ${ts}`;
  }
}
