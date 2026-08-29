import type { keys } from './keyString';

export const KEY_WIDTH = 70;
export const KEY_HEIGHT = 70;
export const KEY_MARGIN = 5;

type KeyString = keyof typeof keys;

// Per-key width overrides (non-standard keys)
const KEY_WIDTH_OVERRIDES: Partial<Record<KeyString, number>> = {
  'Backspace': 100,
  'Tab': 100,
  '\\': 70,
  'CapsLock': 115,
  'Enter': 130,
  'Shift': 135,
  'RShift': 185,
  'Control': 90,
  ' ': 370,
};

export function getKeyWidth(keyString: KeyString): number {
  return KEY_WIDTH_OVERRIDES[keyString] ?? KEY_WIDTH;
}

// Row definitions: each row has keys in order, positions computed from widths
type RowDef = { keys: KeyString[]; rowOffset: number };

/**
 * Only the three letter rows are drawn (2026-08-28). The menu used to render
 * a whole keyboard — number row, Tab/Enter/brackets, both Shifts, the
 * modifier row — which made it large enough to need a third of the window
 * while almost none of those keys carried a binding.
 *
 * The hidden keys still WORK. Ctrl still opens its submenu, CapsLock still
 * switches mode, Space still holds; they simply aren't rendered. That is the
 * whole change: `VISIBLE_KEYS` gates drawing, never binding.
 *
 * Row offsets reproduce the usual keyboard stagger, which the Tab/CapsLock/
 * Shift widths used to provide for free.
 */
const VISIBLE_ROW_DEFS: RowDef[] = [
  { keys: ['q','w','e','r','t','y','u','i','o','p'], rowOffset: 0 },
  { keys: ['a','s','d','f','g','h','j','k','l',';'], rowOffset: 18 },
  { keys: ['z','x','c','v','b','n','m',',','.','/'], rowOffset: 53 },
];

/** Bound but never drawn. They still need a position, because key
 *  construction reads one unconditionally — parked far off-card so a stray
 *  render would be obvious rather than subtly overlapping. */
const HIDDEN_KEYS: KeyString[] = [
  '`','1','2','3','4','5','6','7','8','9','0','-','=','Backspace',
  'Tab','[',']','\\','CapsLock',"'",'Enter','Shift','RShift',
  'Control','Alt',' ','RAlt','RControl',
];

const OFF_CARD = { x: -10000, y: -10000 };

/** The keys the card actually draws, in row order. */
export const VISIBLE_KEYS: KeyString[] =
  VISIBLE_ROW_DEFS.flatMap(r => r.keys);

const VISIBLE_KEY_SET = new Set<KeyString>(VISIBLE_KEYS);

export function isVisibleKey(keyString: KeyString): boolean {
  return VISIBLE_KEY_SET.has(keyString);
}

function computePositions(): Record<KeyString, { x: number; y: number }> {
  const result: Partial<Record<KeyString, { x: number; y: number }>> = {};

  for (let row = 0; row < VISIBLE_ROW_DEFS.length; row++) {
    const { keys: rowKeys, rowOffset } = VISIBLE_ROW_DEFS[row];
    let x = rowOffset;
    const y = row * (KEY_HEIGHT + KEY_MARGIN);
    for (const key of rowKeys) {
      result[key] = { x, y };
      x += getKeyWidth(key) + KEY_MARGIN;
    }
  }

  for (const key of HIDDEN_KEYS) {
    result[key] = { ...OFF_CARD };
  }

  return result as Record<KeyString, { x: number; y: number }>;
}

export const xAndYForKeys: { [K in keyof typeof keys]: { x: number; y: number } } = computePositions() as any;
