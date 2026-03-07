import { Injectable } from '@angular/core';

const STORAGE_KEY = 'kidraw-capslock-swap';

@Injectable({ providedIn: 'root' })
export class KeyboardConfigService {
  private _capsLockCtrlSwap: boolean;

  constructor() {
    this._capsLockCtrlSwap = localStorage.getItem(STORAGE_KEY) === 'true';
  }

  get capsLockCtrlSwap(): boolean {
    return this._capsLockCtrlSwap;
  }

  set capsLockCtrlSwap(value: boolean) {
    this._capsLockCtrlSwap = value;
    localStorage.setItem(STORAGE_KEY, String(value));
  }
}
