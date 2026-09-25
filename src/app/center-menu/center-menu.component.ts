import { Component, ElementRef, Input, ViewChild, effect, inject } from '@angular/core';
import { CenterMenuService } from './center-menu.service';

/**
 * Draws the open center menu and takes the keyboard while it is open.
 *
 * Its field holds the focus, so the keymenu stands aside the same way it does
 * for the ex line (the input-focus guard in KeymenuComponent). Keys:
 * typing filters; Down / Up, Ctrl-J / Ctrl-K and Ctrl-N / Ctrl-P move; Tab
 * copies the highlighted row into the field; Enter chooses; Escape closes.
 */
@Component({
  selector: 'app-center-menu',
  imports: [],
  templateUrl: './center-menu.component.html',
  styleUrl: './center-menu.component.css',
})
export class CenterMenuComponent {
  @Input() dark = false;
  readonly menus = inject(CenterMenuService);

  @ViewChild('field') private field?: ElementRef<HTMLInputElement>;

  constructor() {
    // Each menu that opens gets the focus, its initial text selected.
    effect(() => {
      if (!this.menus.current()) return;
      setTimeout(() => {
        const input = this.field?.nativeElement;
        input?.focus();
        input?.select();
      });
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    const menu = this.menus.current();
    if (!menu) return;
    // Nothing behind the menu should act on these keys.
    event.stopPropagation();
    const action = this.actionFor(event);
    if (!action) return;
    event.preventDefault();
    action();
  }

  onInput(text: string): void {
    this.menus.current()?.list.setText(text);
  }

  choose(index: number): void {
    const menu = this.menus.current();
    if (!menu) return;
    const item = menu.list.visible[index];
    if (item) menu.settle({kind: 'item', value: item.value});
  }

  private actionFor(event: KeyboardEvent): (() => void) | null {
    const menu = this.menus.current()!;
    const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape' || (ctrl && key === '[')) return () => menu.settle(null);
    if (event.key === 'Enter') return () => {
      const choice = menu.list.choice();
      if (choice) menu.settle(choice);
    };
    if (event.key === 'ArrowDown' || (ctrl && (key === 'j' || key === 'n'))) return () => this.move(1);
    if (event.key === 'ArrowUp' || (ctrl && (key === 'k' || key === 'p'))) return () => this.move(-1);
    if (event.key === 'Tab') return () => menu.list.complete();
    return null;
  }

  private move(delta: 1 | -1): void {
    this.menus.current()?.list.move(delta);
    setTimeout(() => this.field?.nativeElement.closest('.center-menu')
      ?.querySelector('.row.highlighted')?.scrollIntoView({block: 'nearest'}));
  }
}
