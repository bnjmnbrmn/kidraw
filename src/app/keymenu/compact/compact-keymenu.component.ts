import {Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';

/** One `[key|Action]` line of the compact keymenu tree (da-200). Rows come
 *  pre-flattened from KeymenuComponent: root bindings in declaration order,
 *  with each held submenu's children spliced in beneath its row. */
export interface CompactMenuRow {
  /** Display form of the key (`a`, `Ctrl`, `Space`, …). */
  key: string;
  label: string;
  /** Indent level; 0 = root menu. */
  depth: number;
  /** Row opens a submenu when held. */
  isSubmenu: boolean;
  /** Part of the currently held submenu chain. */
  held: boolean;
}

/** File-picker-style sidebar listing the live keymenu tree: the root menu as
 *  `[key|Action]` rows, and the children of every held submenu key indented
 *  beneath it. Purely presentational — key handling stays in KeymenuComponent,
 *  which feeds this panel its rows. Initial stab for da-200 / da-159. */
@Component({
  selector: 'app-compact-keymenu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './compact-keymenu.component.html',
  styleUrl: './compact-keymenu.component.css',
})
export class CompactKeymenuComponent implements OnChanges {
  @Input() rows: CompactMenuRow[] = [];
  @Input() dark = false;
  @Input() side: 'left' | 'right' = 'right';
  /** Kept in sync with the viewport inset the drawing area reserves. */
  @Input() widthPx = 268;
  @Input() modeName = '';

  @ViewChild('rowsEl') rowsEl?: ElementRef<HTMLElement>;

  ngOnChanges(changes: SimpleChanges): void {
    // A submenu held from near the bottom of a long root menu would open its
    // children below the fold. Bring the deepest held row into view so the
    // options you just asked for are the ones you can see.
    if (!changes['rows']) return;
    queueMicrotask(() => {
      const container = this.rowsEl?.nativeElement;
      if (!container) return;
      const held = container.querySelectorAll<HTMLElement>('.row.held');
      const deepest = held[held.length - 1];
      deepest?.scrollIntoView({block: 'nearest'});
    });
  }

  trackRow(index: number, row: CompactMenuRow): string {
    return `${row.depth}:${row.key}:${row.label}`;
  }
}
