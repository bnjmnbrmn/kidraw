import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

const CAPSLOCK_KEY = 'kidraw-capslock-swap';
const FINGER_HIDE_KEY = 'kidraw-hide-finger-keys';

@Injectable({ providedIn: 'root' })
export class KeyboardConfigService {
  private _capsLockCtrlSwap: boolean;
  private _hideFingerBlockedKeys: boolean;
  private _configChanged = new Subject<void>();
  readonly configChanged$ = this._configChanged.asObservable();

  constructor() {
    this._capsLockCtrlSwap = localStorage.getItem(CAPSLOCK_KEY) === 'true';
    this._hideFingerBlockedKeys = localStorage.getItem(FINGER_HIDE_KEY) === 'true';
  }

  get capsLockCtrlSwap(): boolean {
    return this._capsLockCtrlSwap;
  }

  set capsLockCtrlSwap(value: boolean) {
    this._capsLockCtrlSwap = value;
    localStorage.setItem(CAPSLOCK_KEY, String(value));
  }

  get hideFingerBlockedKeys(): boolean {
    return this._hideFingerBlockedKeys;
  }

  set hideFingerBlockedKeys(value: boolean) {
    this._hideFingerBlockedKeys = value;
    localStorage.setItem(FINGER_HIDE_KEY, String(value));
    this._configChanged.next();
  }
}
