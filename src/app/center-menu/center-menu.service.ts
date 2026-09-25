import { Injectable, signal } from '@angular/core';
import { CenterMenuChoice, CenterMenuList, CenterMenuSpec } from './center-menu.model';

/** The center menu that is open, if any, and how to answer whoever opened it. */
export interface OpenCenterMenu {
  spec: CenterMenuSpec<unknown>;
  list: CenterMenuList<unknown>;
  settle(choice: CenterMenuChoice<unknown> | null): void;
}

/**
 * Opens center menus (center-menu.model.ts). One at a time: opening another
 * closes the first, which answers null. Whoever opens one gets a promise of
 * the choice — null when the menu was closed without one.
 */
@Injectable({providedIn: 'root'})
export class CenterMenuService {
  readonly current = signal<OpenCenterMenu | null>(null);

  open<T>(spec: CenterMenuSpec<T>): Promise<CenterMenuChoice<T> | null> {
    this.close();
    return new Promise(resolve => {
      const menu: OpenCenterMenu = {
        spec: spec as CenterMenuSpec<unknown>,
        list: new CenterMenuList(spec) as CenterMenuList<unknown>,
        settle: choice => {
          if (this.current() === menu) this.current.set(null);
          resolve(choice as CenterMenuChoice<T> | null);
        },
      };
      this.current.set(menu);
    });
  }

  /** Close the open menu, if any, answering null. */
  close(): void {
    this.current()?.settle(null);
  }
}
