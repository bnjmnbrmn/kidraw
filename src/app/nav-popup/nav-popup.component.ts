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

  /** Selection moved (id of the newly highlighted row). */
  @Output() highlightRow = new EventEmitter<string>();
  /** Row committed; walk = keep navigating (Tab) vs jump and close (Enter). */
  @Output() commitRow = new EventEmitter<{id: string; walk: boolean}>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  query = '';
  filtered: RenderedRow[] = [];
  selectedIndex = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows']) {
      this.query = '';
      if (this.searchInput) this.searchInput.nativeElement.value = '';
      // Compute rows synchronously so the template renders, but defer the
      // highlight emit: ngOnChanges runs inside the parent's change-detection
      // pass, and the parent moves the popup in response — emitting now trips
      // NG0100 (ExpressionChangedAfterItHasBeenChecked).
      const topId = this.refilter();
      setTimeout(() => {
        this.searchInput?.nativeElement.focus();
        if (topId !== null) this.highlightRow.emit(topId);
      });
    }
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
      this.select(this.selectedIndex + delta);
    };
    if (key === 'ArrowDown' || (event.ctrlKey && (key === 'n' || key === 'j'))) { move(1); return; }
    if (key === 'ArrowUp' || (event.ctrlKey && (key === 'p' || key === 'k'))) { move(-1); return; }
    if (key === 'Enter' || key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      const row = this.filtered[this.selectedIndex];
      if (row) this.commitRow.emit({id: row.row.id, walk: key === 'Tab'});
      return;
    }
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    event.stopPropagation(); // typing (incl. Backspace/Delete) stays in the box
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
    if (this.filtered.length === 0) return;
    const n = this.filtered.length;
    this.selectedIndex = ((index % n) + n) % n;
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
