export const KEY_WIDTH = 70;
export const KEY_HEIGHT = 70;
export const KEY_MARGIN = 5;
export const ROW_OFFSETS = [0, 10, 30];

export const rowsAndColsForKeys: { [K in keyof typeof import('./keyString').keys]: { row: number; col: number } } = {
  'q': {row: 0, col: 0},
  'w': {row: 0, col: 1},
  'e': {row: 0, col: 2},
  'r': {row: 0, col: 3},
  't': {row: 0, col: 4},
  'y': {row: 0, col: 5},
  'u': {row: 0, col: 6},
  'i': {row: 0, col: 7},
  'o': {row: 0, col: 8},
  'p': {row: 0, col: 9},
  'a': {row: 1, col: 0},
  's': {row: 1, col: 1},
  'd': {row: 1, col: 2},
  'f': {row: 1, col: 3},
  'g': {row: 1, col: 4},
  'h': {row: 1, col: 5},
  'j': {row: 1, col: 6},
  'k': {row: 1, col: 7},
  'l': {row: 1, col: 8},
  ';': {row: 1, col: 9},
  'z': {row: 2, col: 0},
  'x': {row: 2, col: 1},
  'c': {row: 2, col: 2},
  'v': {row: 2, col: 3},
  'b': {row: 2, col: 4},
  'n': {row: 2, col: 5},
  'm': {row: 2, col: 6},
  ',': {row: 2, col: 7},
  '.': {row: 2, col: 8},
  '/': {row: 2, col: 9}
};

export const xAndYForKeys: { [K in keyof typeof import('./keyString').keys]: { x: number; y: number } } = 
  Object.fromEntries(
    Object.entries(rowsAndColsForKeys).map(
      ([key, {row, col}]) =>
        [
          key,
          {
            x: col * (KEY_WIDTH + KEY_MARGIN) + ROW_OFFSETS[row],
            y: row * (KEY_HEIGHT + KEY_MARGIN)
          }
        ])
  ) as { [K in keyof typeof import('./keyString').keys]: { x: number; y: number } };
