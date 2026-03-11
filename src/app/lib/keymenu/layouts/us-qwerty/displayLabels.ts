import { KeyString } from './keyString';

export type KeyboardLayout = 'us-windows' | 'us-mac';

const MAC_LABELS: Partial<Record<KeyString, string>> = {
  'Backspace': '⌫',
  'Tab': '⇥',
  '\\': '\\',
  'CapsLock': '⇪',
  'Enter': '⏎',
  'Shift': '⇧',
  'RShift': '⇧',
  'Control': '⌃',
  'Alt': '⌥',
  ' ': '␣',
  'RAlt': '⌥',
  'RControl': '⌃',
};

const WINDOWS_LABELS: Partial<Record<KeyString, string>> = {
  'Backspace': 'Bksp',
  'Tab': 'Tab',
  '\\': '\\',
  'CapsLock': 'Caps',
  'Enter': 'Enter',
  'Shift': 'Shift',
  'RShift': 'Shift',
  'Control': 'Ctrl',
  'Alt': 'Alt',
  ' ': 'Space',
  'RAlt': 'Alt',
  'RControl': 'Ctrl',
};

export function getKeyDisplayLabel(keyString: KeyString, layout: KeyboardLayout): string {
  const labels = layout === 'us-mac' ? MAC_LABELS : WINDOWS_LABELS;
  return labels[keyString] ?? keyString;
}

export function detectKeyboardLayout(): KeyboardLayout {
  if (typeof navigator === 'undefined') return 'us-windows';

  // Check navigator.userAgentData first (modern browsers)
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform) {
    if (uaData.platform === 'macOS') return 'us-mac';
    return 'us-windows';
  }

  // Fall back to navigator.platform
  if (navigator.platform?.startsWith('Mac')) return 'us-mac';
  return 'us-windows';
}
