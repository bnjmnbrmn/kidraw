import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { KeyboardLayout, detectKeyboardLayout } from '../lib/keymenu/layouts/us-qwerty';

const CAPSLOCK_KEY = 'kidraw-capslock-swap';
const FINGER_HIDE_KEY = 'kidraw-hide-finger-keys';
const LAYOUT_KEY = 'kidraw-keyboard-layout';
const PROFILE_KEY = 'kidraw-key-profile';

export type KeyProfile = 'vim' | 'default';

@Injectable({ providedIn: 'root' })
export class KeyboardConfigService {
  private _capsLockCtrlSwap: boolean;
  private _hideFingerBlockedKeys: boolean;
  private _keyboardLayout: KeyboardLayout;
  private _keyProfile: KeyProfile;
  private _configChanged = new Subject<void>();
  readonly configChanged$ = this._configChanged.asObservable();

  constructor() {
    this._capsLockCtrlSwap = localStorage.getItem(CAPSLOCK_KEY) === 'true';
    this._hideFingerBlockedKeys = localStorage.getItem(FINGER_HIDE_KEY) === 'true';
    const stored = localStorage.getItem(LAYOUT_KEY);
    this._keyboardLayout = (stored === 'us-mac' || stored === 'us-windows') ? stored : detectKeyboardLayout();
    const storedProfile = localStorage.getItem(PROFILE_KEY);
    this._keyProfile = (storedProfile === 'vim' || storedProfile === 'default') ? storedProfile : 'vim';
  }

  get capsLockCtrlSwap(): boolean {
    return this._capsLockCtrlSwap;
  }

  set capsLockCtrlSwap(value: boolean) {
    this._capsLockCtrlSwap = value;
    localStorage.setItem(CAPSLOCK_KEY, String(value));
    this._configChanged.next();
  }

  get hideFingerBlockedKeys(): boolean {
    return this._hideFingerBlockedKeys;
  }

  set hideFingerBlockedKeys(value: boolean) {
    this._hideFingerBlockedKeys = value;
    localStorage.setItem(FINGER_HIDE_KEY, String(value));
    this._configChanged.next();
  }

  get keyboardLayout(): KeyboardLayout {
    return this._keyboardLayout;
  }

  set keyboardLayout(value: KeyboardLayout) {
    this._keyboardLayout = value;
    localStorage.setItem(LAYOUT_KEY, value);
    this._configChanged.next();
  }

  get keyProfile(): KeyProfile {
    return this._keyProfile;
  }

  set keyProfile(value: KeyProfile) {
    this._keyProfile = value;
    localStorage.setItem(PROFILE_KEY, value);
    this._configChanged.next();
  }
}
