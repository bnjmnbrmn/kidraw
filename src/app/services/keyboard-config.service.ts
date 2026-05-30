import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { KeyboardLayout, detectKeyboardLayout } from '../lib/keymenu/layouts/us-qwerty';

const CAPSLOCK_KEY = 'kidraw-capslock-swap';
const FINGER_HIDE_KEY = 'kidraw-hide-finger-keys';
const LAYOUT_KEY = 'kidraw-keyboard-layout';
const PROFILE_KEY = 'kidraw-key-profile';
const COMPACT_VIEW_KEY = 'kidraw-compact-view';

export type KeyProfile = 'vim' | 'ijkl';

@Injectable({ providedIn: 'root' })
export class KeyboardConfigService {
  private _capsLockCtrlSwap: boolean;
  private _hideFingerBlockedKeys: boolean;
  private _keyboardLayout: KeyboardLayout;
  private _keyProfile: KeyProfile;
  private _compactView: boolean;
  private _configChanged = new Subject<void>();
  readonly configChanged$ = this._configChanged.asObservable();

  constructor() {
    this._capsLockCtrlSwap = localStorage.getItem(CAPSLOCK_KEY) === 'true';
    this._hideFingerBlockedKeys = localStorage.getItem(FINGER_HIDE_KEY) === 'true';
    const stored = localStorage.getItem(LAYOUT_KEY);
    this._keyboardLayout = (stored === 'us-mac' || stored === 'us-windows') ? stored : detectKeyboardLayout();
    // Default to 'vim'. Old 'default' value (pre-rename) maps to 'ijkl'.
    const storedProfile = localStorage.getItem(PROFILE_KEY);
    this._keyProfile = storedProfile === 'ijkl' || storedProfile === 'default' ? 'ijkl' : 'vim';

    // Compact view: URL param ?compact=1 wins over localStorage; otherwise read localStorage.
    // URL param ?compact=0 explicitly disables.
    const params = typeof window !== 'undefined' && window.location
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    const urlCompact = params.get('compact');
    if (urlCompact === '1' || urlCompact === 'true') {
      this._compactView = true;
    } else if (urlCompact === '0' || urlCompact === 'false') {
      this._compactView = false;
    } else {
      this._compactView = localStorage.getItem(COMPACT_VIEW_KEY) === 'true';
    }
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

  get compactView(): boolean {
    return this._compactView;
  }

  set compactView(value: boolean) {
    this._compactView = value;
    localStorage.setItem(COMPACT_VIEW_KEY, String(value));
    this._configChanged.next();
  }
}
