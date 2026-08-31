import {AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy,
        Output, SimpleChanges, ViewChild, inject} from '@angular/core';
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
  /** Gesture mark shown independently from the action label. */
  indicator?: 'release';
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
export class CompactKeymenuComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() rows: CompactMenuRow[] = [];
  @Input() dark = false;
  @Input() side: 'left' | 'right' = 'right';
  /** Widest the panel may grow. It sizes itself to its rows below that, so
   *  this is a cap rather than a column width (da-436). */
  @Input() maxWidthPx = 268;
  /** Current mode, in the same words the full menu's chip uses. */
  @Input() modeName = '';
  /** Accent colour naming that mode, shown as a dot beside it. */
  @Input() modeColor = '#888888';
  /** Shown instead of rows when the full menu would not be listing keys
   *  either — free typing, where every key is just a character. */
  @Input() hint = '';
  /** The width the panel actually took, so the drawing area can inset its
   *  viewport by what is really covered instead of by the cap. */
  @Output() renderedWidth = new EventEmitter<number>();

  @ViewChild('rowsEl') rowsEl?: ElementRef<HTMLElement>;
  @ViewChild('panelEl') panelEl?: ElementRef<HTMLElement>;

  private zone = inject(NgZone);
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    const panel = this.panelEl?.nativeElement;
    if (!panel) return;
    // The width changes with every submenu push and pop, so it is watched
    // rather than measured once.
    this.resizeObserver = new ResizeObserver(() => {
      // offsetWidth, not the observed content box: the border is part of
      // what the panel covers.
      this.zone.run(() => this.renderedWidth.emit(panel.offsetWidth));
    });
    this.resizeObserver.observe(panel);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

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
