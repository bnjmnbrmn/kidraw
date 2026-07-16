import {Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild} from '@angular/core';
import {fuzzyMatch} from '../lib/fuzzy-match';

/** One choice in the popup. Generic on purpose: the nav popup is the first
 *  client, but the same widget is intended for the vault fuzzy finder and
 *  the command palette. */
export interface PopupRow {
  /** Opaque id handed back on highlight/commit. */
  id: string;
  /** Leading glyph (e.g. '→' / '←'). */
  glyph?: string;
  /** Primary text (destination node label). */
  title: string;
  /** Secondary text (edge label). */
  subtitle?: string;
  /** Small type pills (edge kind, node tags). */
  tags?: string[];
  /** Rendered under a divider (e.g. reverse-direction candidates). */
  secondary?: boolean;
}

interface RenderedRow {
  row: PopupRow;
  titleSegments: {text: string; hit: boolean}[];
  subtitleSegments: {text: string; hit: boolean}[];
}

/** Split `text` into hit/miss segments given matched positions (offset by
 *  `base` into the concatenated search string). */
function segments(text: string, positions: number[], base: number): {text: string; hit: boolean}[] {
  const hits = new Set(positions.filter(p => p >= base && p < base + text.length).map(p => p - base));
  const out: {text: string; hit: boolean}[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else out.push({text: text[i], hit});
  }
  return out;
}

@Component({
  selector: 'app-nav-popup',
  imports: [],
  templateUrl: './nav-popup.component.html',
  styleUrl: './nav-popup.component.css',
})
export class NavPopupComponent implements OnChanges {
  @Input() rows: PopupRow[] = [];
  /** Position within the hosting (relatively positioned) container. */
  @Input() left = 0;
  @Input() top = 0;
  @Input() dark = false;
  /** Physical key whose tap opened the popup (and may still be held).
   *  Releasing it while the search pseudo-item is selected starts filtering. */
  @Input() holdKey: string | null = null;

  /** Selection moved (id of the newly highlighted row). */
  @Output() highlightRow = new EventEmitter<string>();
  /** Row committed; walk = keep navigating (Tab) vs jump and close (Enter). */
  @Output() commitRow = new EventEmitter<{id: string; walk: boolean}>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  query = '';
  filtered: RenderedRow[] = [];
  /** -1 = the search pseudo-item (rendered above the first row). */
  selectedIndex = 0;
  /** false = list mode: the input swallows typing and plain j/k/n/p navigate.
   *  true = filter mode: typing filters, ^j/^k (and arrows) navigate. */
  filterMode = false;
  /** Whether the keyboard moved the selection since the popup (re)opened.
   *  Distinguishes hold-navigate-release (commit on release) from a plain
   *  tap of the Go key (keyup right after opening — must not commit). */
  private navigatedSinceOpen = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows']) {
      this.query = '';
      this.filterMode = false;
      this.navigatedSinceOpen = false;
      if (this.searchInput) this.searchInput.nativeElement.value = '';
      // Compute rows synchronously so the template renders, but defer the
      // highlight emit: ngOnChanges runs inside the parent's change-detection
      // pass, and the parent moves the popup in response — emitting now trips
      // NG0100 (ExpressionChangedAfterItHasBeenChecked).
      const topId = this.refilter();
      setTimeout(() => {
        // The input is always physically focused so every key lands here —
        // list mode just swallows the printable ones (no stray 'fff' from a
        // still-held Go key; the caret is hidden via CSS until filtering).
        this.searchInput?.nativeElement.focus();
        if (topId !== null) this.highlightRow.emit(topId);
      });
    }
  }

  get hint(): string {
    return this.filterMode
      ? '^j ^k move · Enter jump · Tab walk · Esc list'
      : 'j k move · Enter jump · Tab walk · Esc close';
  }

  onInput(value: string): void {
    this.query = value;
    // Runs from a DOM event handler, outside change detection — safe to emit now.
    const topId = this.refilter();
    if (topId !== null) this.highlightRow.emit(topId);
  }

  onKeydown(event: KeyboardEvent): void {
    // The keymenu is suspended while the popup is open; everything the
    // popup owns must not leak back out either.
    const key = event.key;
    const move = (delta: number) => {
      event.preventDefault();
      event.stopPropagation();
      this.navigatedSinceOpen = true;
      this.select(this.selectedIndex + delta);
    };
    // ^n/^p stay bound for muscle memory but are NOT advertised in the hint:
    // Chrome/Firefox reserve Ctrl+N (new window) at the browser level — the
    // page never receives the keydown, so it works only where the browser
    // chooses not to claim it. ^j/^k and the arrows always reach us.
    if (key === 'ArrowDown' || (event.ctrlKey && (key === 'n' || key === 'j'))) { move(1); return; }
    if (key === 'ArrowUp' || (event.ctrlKey && (key === 'p' || key === 'k'))) { move(-1); return; }
    // Esc / ^[ peel one layer: filter mode → list mode (query and filtered
    // rows kept), list mode → close (back to the main keymenu).
    if (key === 'Escape' || (event.ctrlKey && key === '[')) {
      event.preventDefault();
      event.stopPropagation();
      if (this.filterMode) this.exitFilterMode();
      else this.closed.emit();
      return;
    }
    if (key === 'Enter' || key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      if (this.selectedIndex === -1) {
        this.enterFilterMode();
        return;
      }
      const row = this.filtered[this.selectedIndex];
      if (row) this.commitRow.emit({id: row.row.id, walk: key === 'Tab'});
      return;
    }
    if (!this.filterMode) {
      // List mode: plain vim keys navigate (n/p keep the old traversal
      // muscle memory and work while the Go key is still held)...
      if (key === 'j' || key === 'n') { move(1); return; }
      if (key === 'k' || key === 'p') { move(-1); return; }
      // ...and everything else is swallowed so nothing types into the box.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.stopPropagation(); // typing (incl. Backspace/Delete) stays in the box
  }

  /** Releasing the Go key acts on the selection — the hold-f → navigate →
   *  release rhythm from the old traversal: over the search pseudo-item it
   *  starts filtering, over a row it jumps there. A plain tap (keyup with no
   *  navigation in between) leaves the popup open. */
  onKeyup(event: KeyboardEvent): void {
    event.stopPropagation();
    if (this.filterMode || this.holdKey === null
        || event.key.toLowerCase() !== this.holdKey.toLowerCase()) {
      return;
    }
    if (this.selectedIndex === -1) {
      this.enterFilterMode();
      return;
    }
    if (this.navigatedSinceOpen) {
      const row = this.filtered[this.selectedIndex];
      if (row) this.commitRow.emit({id: row.row.id, walk: false});
    }
  }

  /** Clicking the box is an explicit "I want to type". */
  onSearchMousedown(): void {
    if (!this.filterMode) this.enterFilterMode();
  }

  private enterFilterMode(): void {
    this.filterMode = true;
    // Selection returns to the rows so ^j/^k walk the filtered list.
    if (this.filtered.length > 0) {
      this.selectedIndex = 0;
      this.highlightRow.emit(this.filtered[0].row.id);
    }
  }

  private exitFilterMode(): void {
    this.filterMode = false;
    // Query and filtered rows survive; selection stays put (or falls back to
    // the search item when nothing matched).
    if (this.filtered.length === 0) this.selectedIndex = -1;
  }

  onRowClick(index: number): void {
    this.select(index);
    const row = this.filtered[this.selectedIndex];
    if (row) this.commitRow.emit({id: row.row.id, walk: false});
  }

  onRowEnter(index: number): void {
    if (index !== this.selectedIndex) this.select(index);
  }

  onBackdrop(): void {
    this.closed.emit();
  }

  showDividerBefore(index: number): boolean {
    if (index === 0) return this.filtered[0]?.row.secondary === true;
    return !this.filtered[index - 1].row.secondary && this.filtered[index].row.secondary === true;
  }

  private select(index: number): void {
    const n = this.filtered.length;
    if (this.filterMode) {
      // Filter mode cycles the rows only — the search box is already active.
      if (n === 0) return;
      this.selectedIndex = ((index % n) + n) % n;
    } else {
      // List mode cycles [search, row0 … rowN-1]: shift by one so the wrap
      // arithmetic runs over 0..n, then shift back to -1..n-1.
      const total = n + 1;
      this.selectedIndex = ((((index + 1) % total) + total) % total) - 1;
    }
    if (this.selectedIndex === -1) return; // search item: keep the last glow
    this.highlightRow.emit(this.filtered[this.selectedIndex].row.id);
    setTimeout(() => {
      const el = document.querySelector('.nav-popup .row.selected');
      (el as HTMLElement | null)?.scrollIntoView({block: 'nearest'});
    });
  }

  /** Recompute `filtered` and reset the selection to the top. Returns the id
   *  of the new top row (or null if empty) so the caller can decide when to
   *  emit the highlight — see the NG0100 note in ngOnChanges. */
  private refilter(): string | null {
    const plain = (row: PopupRow) => ({
      row,
      titleSegments: segments(row.title, [], 0),
      subtitleSegments: segments(row.subtitle ?? '', [], 0),
    });
    if (this.query.trim() === '') {
      this.filtered = this.rows.map(plain);
    } else {
      const scored: {r: RenderedRow; score: number; index: number}[] = [];
      this.rows.forEach((row, index) => {
        const searchText = `${row.title} ${row.subtitle ?? ''} ${(row.tags ?? []).join(' ')}`;
        const m = fuzzyMatch(this.query.trim(), searchText);
        if (!m) return;
        scored.push({
          r: {
            row,
            titleSegments: segments(row.title, m.positions, 0),
            subtitleSegments: segments(row.subtitle ?? '', m.positions, row.title.length + 1),
          },
          score: m.score,
          index,
        });
      });
      scored.sort((a, b) =>
        Number(a.r.row.secondary === true) - Number(b.r.row.secondary === true)
        || b.score - a.score
        || a.index - b.index);
      this.filtered = scored.map(s => s.r);
    }
    this.selectedIndex = 0;
    return this.filtered.length > 0 ? this.filtered[0].row.id : null;
  }
}
