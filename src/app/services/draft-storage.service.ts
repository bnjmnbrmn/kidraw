import { Injectable } from '@angular/core';

import { GraphSnapshot } from '../drawing-area/graph-snapshot';
import {
  filesToSnapshot,
  snapshotToFiles,
} from '../lib/file-format/snapshot-mapping';
import { KidrawGraphDoc, KidrawStyleSet } from '../lib/file-format/types';

// Dev-only draft mirror: every draft save is also POSTed to the local log
// collector (tools/log-server.js), which writes tools/draft-mirror.json so
// an agent on the dev box can see the graph currently being edited.
// Remote hosts only (kidraw.dev.bnjmnbrmn.com, phones), same-origin via
// nginx: localhost loads are almost always Playwright repro/QA runs, and
// their throwaway test drafts were clobbering the mirror of the real
// session (2026-07-18).
const DRAFT_MIRROR_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? null
  : '/debug-log/draft';

/**
 * Manages the localStorage draft — kidraw's crash-recovery layer.
 *
 * The draft is independent of any file the user has open: it's "the last
 * known state, in case the tab is closed before saving to a real file."
 *
 * Schema v2 = a {graph doc, style set} pair plus file-handle metadata.
 * Older v1 saves (raw GraphSnapshot at key `kidraw_graph_v1`) are
 * silently migrated on first load.
 */
@Injectable({ providedIn: 'root' })
export class DraftStorageService {
  static readonly V1_KEY = 'kidraw_graph_v1';
  static readonly V2_KEY = 'kidraw_draft_v2';

  /**
   * Load the current draft, performing v1→v2 migration if necessary.
   * Returns null if there is no draft at all.
   */
  load(): DraftStateV2 | null {
    const v2 = this.readV2();
    if (v2) {
      // Mirror on load too: opening/reloading the app pushes the current
      // draft to the collector without waiting for the first edit.
      this.mirror(JSON.stringify(v2));
      return v2;
    }

    const migrated = this.tryMigrateV1();
    if (migrated) {
      this.save(migrated);
      this.clearV1();
      return migrated;
    }

    return null;
  }

  /** Persist a draft state. Silent no-op on quota errors. */
  save(state: DraftStateV2): void {
    const json = JSON.stringify(state);
    try {
      localStorage.setItem(DraftStorageService.V2_KEY, json);
    } catch {
      // Quota exceeded or storage disabled — skip.
    }
    this.mirror(json);
  }

  /** Fire-and-forget mirror of the draft to the dev log collector.
   *  sendBeacon because the draft saves on beforeunload — a plain fetch
   *  would be dropped with the page. The raw string keeps it a "simple"
   *  request (no CORS preflight, which beacons can't perform). Best-effort:
   *  any failure is swallowed — the mirror is an observation channel,
   *  never a dependency of saving. */
  private mirror(json: string): void {
    if (DRAFT_MIRROR_URL === null) return;
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon(DRAFT_MIRROR_URL, json))) {
        fetch(DRAFT_MIRROR_URL, { method: 'POST', body: json, keepalive: true })
          .catch(() => {});
      }
    } catch {
      // Never let the mirror break a save.
    }
  }

  /** Convenience: snapshot + metadata → saved draft. */
  saveSnapshot(
    snap: GraphSnapshot,
    options: { filePath?: string | null; dirty?: boolean;
               view?: { x: number; y: number; scale: number } } = {},
  ): void {
    const { doc, style } = snapshotToFiles(snap);
    this.save({
      version: 2,
      doc,
      style,
      filePath: options.filePath ?? null,
      dirty: options.dirty ?? true,
      savedAt: Date.now(),
      ...(options.view ? { view: options.view } : {}),
    });
  }

  /** Convert a draft back to the runtime GraphSnapshot shape. */
  draftToSnapshot(draft: DraftStateV2): GraphSnapshot {
    return filesToSnapshot(draft.doc, draft.style);
  }

  /** Clear all draft state (both v1 and v2 keys). */
  clear(): void {
    localStorage.removeItem(DraftStorageService.V2_KEY);
    this.clearV1();
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private readV2(): DraftStateV2 | null {
    const raw = localStorage.getItem(DraftStorageService.V2_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!isShallowValidDraft(parsed)) return null;
      return parsed as DraftStateV2;
    } catch {
      return null;
    }
  }

  private tryMigrateV1(): DraftStateV2 | null {
    const raw = localStorage.getItem(DraftStorageService.V1_KEY);
    if (!raw) return null;
    try {
      const v1 = JSON.parse(raw) as GraphSnapshot;
      if (!v1 || !Array.isArray(v1.nodes) || !Array.isArray(v1.edges)) return null;
      const { doc, style } = snapshotToFiles(v1);
      return {
        version: 2,
        doc,
        style,
        filePath: null,
        dirty: true,
        savedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  private clearV1(): void {
    localStorage.removeItem(DraftStorageService.V1_KEY);
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────

export interface DraftStateV2 {
  version: 2;
  doc: KidrawGraphDoc;
  style: KidrawStyleSet;
  /** Path of the backing file, or null for an unsaved graph. */
  filePath: string | null;
  /** True if the in-memory state has unsaved changes vs. the backing file. */
  dirty: boolean;
  /** Wall-clock timestamp (ms) when this draft was last written. */
  savedAt: number;
  /** Drawing-layer viewport (pan x/y in stage px, uniform scale) at save
   *  time, so a page refresh restores your place instead of resetting.
   *  Optional: older drafts and non-viewport saves omit it. */
  view?: { x: number; y: number; scale: number };
}

function isShallowValidDraft(raw: unknown): raw is DraftStateV2 {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as { [k: string]: unknown };
  return (
    r['version'] === 2 &&
    typeof r['doc'] === 'object' &&
    r['doc'] !== null &&
    typeof r['style'] === 'object' &&
    r['style'] !== null
  );
}
