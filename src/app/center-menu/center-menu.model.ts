/**
 * Center menus: lists that open over the middle of the window for choices the
 * keymenu cannot hold — a file from the vault, a name to save under, the
 * diagram type (notes/idea-center-menus.md). Typing filters the list, the
 * arrows or Ctrl-J / Ctrl-K (Ctrl-N / Ctrl-P where the browser passes them on)
 * move, Enter chooses, Escape closes.
 *
 * This file is the list's behavior, free of Angular and the DOM.
 */
import { fuzzyMatch } from '../lib/fuzzy-match';

export interface CenterMenuItem<T> {
  label: string;
  /** A second, quieter line: a description, a path, "current". */
  detail?: string;
  value: T;
}

export interface CenterMenuSpec<T> {
  title: string;
  items: CenterMenuItem<T>[];
  /** Search sits low on the screen so the drawing stays visible; the rest
   *  sit in the middle. */
  placement?: 'center' | 'lower';
  /** What the field says before anything is typed. */
  placeholder?: string;
  /** Text the field starts with (selected, so typing replaces it). */
  initialText?: string;
  /** The typed text is itself an answer (a name to save under): Enter takes
   *  it unless you have moved onto a row. */
  acceptsText?: boolean;
  /** Shown when nothing matches, or there is nothing to list. */
  emptyText?: string;
  /** The row to start on, by value. */
  initialValue?: T;
}

export type CenterMenuChoice<T> =
  | {kind: 'item'; value: T}
  | {kind: 'text'; text: string};

/** Which items show for the typed text, which one is highlighted, and what
 *  Enter means. */
export class CenterMenuList<T> {
  private query = '';
  /** Index into `visible`; -1 means no row, only the typed text. */
  private index: number;
  visible: CenterMenuItem<T>[];

  constructor(private readonly spec: CenterMenuSpec<T>) {
    this.query = spec.initialText ?? '';
    // The initial text of a text menu is a suggestion, not a filter.
    this.visible = spec.acceptsText ? [...spec.items] : this.filtered();
    this.index = this.startIndex();
  }

  get text(): string {
    return this.query;
  }

  get highlighted(): number {
    return this.index;
  }

  setText(text: string): void {
    this.query = text;
    this.visible = this.filtered();
    this.index = this.spec.acceptsText || this.visible.length === 0 ? -1 : 0;
  }

  /** Move the highlight; a text menu can move back up off the list, onto
   *  the typed text. */
  move(delta: 1 | -1): void {
    if (this.visible.length === 0) return;
    const floor = this.spec.acceptsText ? -1 : 0;
    this.index = Math.min(this.visible.length - 1, Math.max(floor, this.index + delta));
  }

  /** Tab: put the highlighted row's label in the field, to edit it. */
  complete(): void {
    const item = this.visible[this.index];
    if (item) this.setText(item.label);
  }

  /** What Enter chooses, or null when it chooses nothing. */
  choice(): CenterMenuChoice<T> | null {
    const item = this.visible[this.index];
    if (item) return {kind: 'item', value: item.value};
    const text = this.query.trim();
    return this.spec.acceptsText && text !== '' ? {kind: 'text', text} : null;
  }

  private startIndex(): number {
    if (this.spec.acceptsText) return -1;
    const at = this.visible.findIndex(item => item.value === this.spec.initialValue);
    return at >= 0 ? at : this.visible.length > 0 ? 0 : -1;
  }

  /** Items matching the typed text, best first; all of them, in order, for
   *  no text. */
  private filtered(): CenterMenuItem<T>[] {
    const query = this.query.trim();
    if (query === '') return [...this.spec.items];
    return this.spec.items
      .map((item, order) => ({item, order, match: fuzzyMatch(query, item.label)}))
      .filter(entry => entry.match !== null)
      .sort((a, b) => b.match!.score - a.match!.score || a.order - b.order)
      .map(entry => entry.item);
  }
}
