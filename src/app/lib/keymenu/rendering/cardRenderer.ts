import Konva from 'konva';
import { KeyString, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT, KEY_MARGIN, getKeyWidth, KeyboardLayout, getKeyDisplayLabel, VISIBLE_KEYS } from '../layouts/us-qwerty';
import { ThemePalette } from '../../../services/theme.service';
import { CardDepthConfig, CardShadowConfig, DEFAULT_VISUAL_CONFIG } from '../../../services/visual-config.model';

// Blank-key positions and the card's own size both follow what is actually
// drawn, which since 2026-08-28 is the three letter rows only. Hidden keys
// keep their bindings; see VISIBLE_KEYS in layouts/us-qwerty/positions.ts.
const ALL_KEYS: KeyString[] = VISIBLE_KEYS;

// Card padding around the key grid
const CARD_PADDING = 8;
/** Matches the mode chip's corner, so the two read as the same family. */
const CARD_CORNER_RADIUS = 8;

/** The card's outline: its own depth's key stroke, softened so it frames the
 *  card without competing with the keys drawn on it. */
function cardOutlineColor(depth: number, palette: ThemePalette): string {
  const hex = palette.keyStrokes[depth % palette.keyStrokes.length] ?? '#94a3b8';
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const n = parseInt(match[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.55)`;
}

export interface CardRenderConfig {
  depth: number;
  palette: ThemePalette;
  heldKeyStrings?: KeyString[];
  shadowConfig?: CardShadowConfig;
}

export function getCardBackgroundColor(depth: number, palette: ThemePalette): string {
  const backgrounds = palette.cardBackgrounds;
  return backgrounds[Math.min(depth, backgrounds.length - 1)];
}

export function getCardDimensions(): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const key of VISIBLE_KEYS) {
    const pos = xAndYForKeys[key];
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
export function getDepthOffset(depth: number, depthConfig?: CardDepthConfig): { x: number; y: number } {
  const cfg = depthConfig ?? DEFAULT_VISUAL_CONFIG.cardDepth;
  return { x: depth * cfg.depthOffsetX, y: depth * cfg.depthOffsetY };
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

  const sc = config.shadowConfig ?? DEFAULT_VISUAL_CONFIG.cardShadow;
  const depthShadowBlur = sc.baseBlur + config.depth * sc.perDepthBlurIncrement;
  const depthShadowOffset = sc.baseOffset + config.depth * sc.perDepthOffsetIncrement;
  const shadowProps = {
    shadowColor: shadowColor,
    shadowBlur: depthShadowBlur,
    shadowOffset: { x: depthShadowOffset, y: depthShadowOffset },
    shadowOpacity: 1,
    shadowEnabled: true,
  };

  return new Konva.Shape({
    sceneFunc: (ctx, shape) => {
      ctx.beginPath();
      // Outer rect — clockwise, with rounded corners and an outline so a card
      // is the same kind of object as the mode chip below it (da-481).
      const x0 = -CARD_PADDING;
      const y0 = -CARD_PADDING;
      const r = CARD_CORNER_RADIUS;
      ctx.moveTo(x0 + r, y0);
      ctx.lineTo(x0 + cardWidth - r, y0);
      ctx.quadraticCurveTo(x0 + cardWidth, y0, x0 + cardWidth, y0 + r);
      ctx.lineTo(x0 + cardWidth, y0 + cardHeight - r);
      ctx.quadraticCurveTo(x0 + cardWidth, y0 + cardHeight, x0 + cardWidth - r, y0 + cardHeight);
      ctx.lineTo(x0 + r, y0 + cardHeight);
      ctx.quadraticCurveTo(x0, y0 + cardHeight, x0, y0 + cardHeight - r);
      ctx.lineTo(x0, y0 + r);
      ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
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
    stroke: cardOutlineColor(config.depth, config.palette),
    strokeWidth: 1,
    width: cardWidth,
    height: cardHeight,
    ...shadowProps,
  });
}

export interface BlankKeyConfig {
  keyString: KeyString;
  palette: ThemePalette;
  keyboardLayout?: KeyboardLayout;
  capsLockSwap?: boolean;
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
    ? getKeyDisplayLabel(config.keyString, config.keyboardLayout, config.capsLockSwap ?? false)
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
