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

const ROW_DEFS: RowDef[] = [
  { keys: ['`','1','2','3','4','5','6','7','8','9','0','-','=','Backspace'], rowOffset: 0 },
  { keys: ['Tab','q','w','e','r','t','y','u','i','o','p','[',']','\\'], rowOffset: 0 },
  { keys: ['CapsLock','a','s','d','f','g','h','j','k','l',';',"'",'Enter'], rowOffset: 0 },
  { keys: ['Shift','z','x','c','v','b','n','m',',','.','/', 'RShift'], rowOffset: 0 },
];

// Row 4 (bottom modifier row) uses explicit positions (aligned to keys above)
const BOTTOM_ROW_EXPLICIT: { key: KeyString; x: number }[] = [
  { key: 'Control', x: 0 },
  { key: 'Alt', x: 215 },
  { key: ' ', x: 290 },
  { key: 'RAlt', x: 665 },
  { key: 'RControl', x: 740 },
];

function computePositions(): Record<KeyString, { x: number; y: number }> {
  const result: Partial<Record<KeyString, { x: number; y: number }>> = {};

  // Rows 0-3: sequential layout based on key widths
  for (let row = 0; row < ROW_DEFS.length; row++) {
    const { keys: rowKeys, rowOffset } = ROW_DEFS[row];
    let x = rowOffset;
    const y = row * (KEY_HEIGHT + KEY_MARGIN);
    for (const key of rowKeys) {
      result[key] = { x, y };
      x += getKeyWidth(key) + KEY_MARGIN;
    }
  }

  // Bottom modifier row: explicit positions
  const bottomY = ROW_DEFS.length * (KEY_HEIGHT + KEY_MARGIN);
  for (const { key, x } of BOTTOM_ROW_EXPLICIT) {
    result[key] = { x, y: bottomY };
  }

  return result as Record<KeyString, { x: number; y: number }>;
}

export const xAndYForKeys: { [K in keyof typeof keys]: { x: number; y: number } } = computePositions() as any;
