import Konva from 'konva';
import { KeyString, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT, KEY_MARGIN, getKeyWidth, KeyboardLayout, getKeyDisplayLabel } from '../layouts/us-qwerty';
import { ThemePalette } from '../../../services/theme.service';

const ALL_KEYS: KeyString[] = [
  '`','1','2','3','4','5','6','7','8','9','0','-','=','Backspace',
  'Tab','q','w','e','r','t','y','u','i','o','p','[',']','\\',
  'CapsLock','a','s','d','f','g','h','j','k','l',';',"'",'Enter',
  'Shift','z','x','c','v','b','n','m',',','.','/', 'RShift',
  'Control','Alt',' ','RAlt','RControl',
];

// Card padding around the key grid
const CARD_PADDING = 8;

// Diagonal offset per depth level (pixels)
const DEPTH_OFFSET_X = 3;
const DEPTH_OFFSET_Y = 3;

export interface CardRenderConfig {
  depth: number;
  palette: ThemePalette;
  heldKeyStrings?: KeyString[];
}

export function getCardBackgroundColor(depth: number, palette: ThemePalette): string {
  const backgrounds = palette.cardBackgrounds;
  return backgrounds[Math.min(depth, backgrounds.length - 1)];
}

export function getCardDimensions(): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const [key, pos] of Object.entries(xAndYForKeys) as [KeyString, { x: number; y: number }][]) {
    const w = getKeyWidth(key);
    if (pos.x + w > maxX) maxX = pos.x + w;
    if (pos.y + KEY_HEIGHT > maxY) maxY = pos.y + KEY_HEIGHT;
  }
  return {
    width: maxX + CARD_PADDING * 2,
    height: maxY + CARD_PADDING * 2,
  };
}

/** Returns the diagonal offset for a given depth. */
export function getDepthOffset(depth: number): { x: number; y: number } {
  return { x: depth * DEPTH_OFFSET_X, y: depth * DEPTH_OFFSET_Y };
}

/**
 * Creates a card background shape with drop shadow. If heldKeyString is
 * provided, the background has a transparent hole at that key's position.
 */
export function createCardBackground(config: CardRenderConfig): Konva.Shape {
  const { width: cardWidth, height: cardHeight } = getCardDimensions();
  const fillColor = getCardBackgroundColor(config.depth, config.palette);
  const shadowColor = config.palette.cardShadowColor;
  const heldKeyStrings = (config.heldKeyStrings ?? []).filter(k => xAndYForKeys[k]);

  const shadowProps = {
    shadowColor: shadowColor,
    shadowBlur: 8,
    shadowOffset: { x: 3, y: 3 },
    shadowOpacity: 1,
    shadowEnabled: true,
  };

  return new Konva.Shape({
    sceneFunc: (ctx, shape) => {
      ctx.beginPath();
      // Outer rect — clockwise
      const x0 = -CARD_PADDING;
      const y0 = -CARD_PADDING;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + cardWidth, y0);
      ctx.lineTo(x0 + cardWidth, y0 + cardHeight);
      ctx.lineTo(x0, y0 + cardHeight);
      ctx.closePath();
      // Hole rects — counterclockwise (opposite winding = hole with nonzero rule)
      for (const key of heldKeyStrings) {
        const holePos = xAndYForKeys[key];
        const holeW = getKeyWidth(key);
        const hx = holePos.x;
        const hy = holePos.y;
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx, hy + KEY_HEIGHT);
        ctx.lineTo(hx + holeW, hy + KEY_HEIGHT);
        ctx.lineTo(hx + holeW, hy);
        ctx.closePath();
      }
      ctx.fillStrokeShape(shape);
    },
    fill: fillColor,
    width: cardWidth,
    height: cardHeight,
    ...shadowProps,
  });
}

/**
 * Creates highlight border rects around held-key holes.
 * Returns an array of Konva.Rect outlines to add on top of the card background.
 */
export function createHoleHighlights(config: CardRenderConfig): Konva.Rect[] {
  const heldKeyStrings = (config.heldKeyStrings ?? []).filter(k => xAndYForKeys[k]);
  if (heldKeyStrings.length === 0) return [];

  const highlightColor = config.palette.highlightShadowColor;
  const borderWidth = 2;
  const inset = borderWidth / 2;

  return heldKeyStrings.map(key => {
    const pos = xAndYForKeys[key];
    const keyW = getKeyWidth(key);
    return new Konva.Rect({
      x: pos.x - inset,
      y: pos.y - inset,
      width: keyW + borderWidth,
      height: KEY_HEIGHT + borderWidth,
      stroke: highlightColor,
      strokeWidth: borderWidth,
      fill: undefined,
      listening: false,
    });
  });
}

export interface BlankKeyConfig {
  keyString: KeyString;
  palette: ThemePalette;
  keyboardLayout?: KeyboardLayout;
}

export function createBlankKey(config: BlankKeyConfig): Konva.Group {
  const pos = xAndYForKeys[config.keyString];
  const keyW = getKeyWidth(config.keyString);
  const group = new Konva.Group({ x: pos.x, y: pos.y });

  group.add(new Konva.Rect({
    width: keyW,
    height: KEY_HEIGHT,
    fill: config.palette.blankKeyFill,
    stroke: config.palette.blankKeyStroke,
    strokeWidth: 1,
    dash: [3, 6],
  }));

  // Add key name label
  const displayLabel = config.keyboardLayout
    ? getKeyDisplayLabel(config.keyString, config.keyboardLayout)
    : config.keyString;
  group.add(new Konva.Text({
    text: displayLabel,
    width: keyW,
    height: KEY_HEIGHT,
    align: 'center',
    verticalAlign: 'middle',
    fontSize: 11,
    fill: config.palette.keyStrokes[0],
    opacity: 0.65,
    listening: false,
  }));

  return group;
}

/** Maps each key to the set of keys sharing the same finger (standard touch typing). */
const FINGER_GROUPS: KeyString[][] = [
  ['`', '1', 'q', 'a', 'z'],           // left pinky
  ['2', 'w', 's', 'x'],                // left ring
  ['3', 'e', 'd', 'c'],                // left middle
  ['4', '5', 'r', 't', 'f', 'g', 'v', 'b'],  // left index
  ['6', '7', 'y', 'u', 'h', 'j', 'n', 'm'],  // right index
  ['8', 'i', 'k', ','],                // right middle
  ['9', 'o', 'l', '.'],                // right ring
  ['0', '-', '=', 'p', ';', '/', '[', ']', "'"],  // right pinky
];

const KEY_TO_FINGER_GROUP: Map<KeyString, Set<KeyString>> = new Map();
for (const group of FINGER_GROUPS) {
  const groupSet = new Set<KeyString>(group);
  for (const key of group) {
    KEY_TO_FINGER_GROUP.set(key, groupSet);
  }
}

/** Returns keys that are unreachable because they share a finger with a held key. */
function getBlockedByFinger(heldKeyStrings: KeyString[]): Set<KeyString> {
  const blocked = new Set<KeyString>();
  for (const held of heldKeyStrings) {
    const group = KEY_TO_FINGER_GROUP.get(held);
    if (group) {
      for (const k of group) {
        blocked.add(k);
      }
    }
  }
  return blocked;
}

/**
 * Returns the set of KeyStrings that should be rendered as blank keys
 * (all positions minus bound keys, held keys, and optionally finger-blocked keys).
 */
export function getBlankKeyPositions(
  boundKeys: Set<KeyString>,
  heldKeyStrings?: KeyString[],
  hideFingerBlocked: boolean = false
): KeyString[] {
  const held = new Set(heldKeyStrings ?? []);
  const blocked = hideFingerBlocked ? getBlockedByFinger(heldKeyStrings ?? []) : new Set<KeyString>();
  return ALL_KEYS.filter(k => !boundKeys.has(k) && !held.has(k) && !blocked.has(k));
}

export { ALL_KEYS, CARD_PADDING };
