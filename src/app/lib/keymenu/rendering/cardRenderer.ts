import Konva from 'konva';
import { KeyString, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT, KEY_MARGIN, ROW_OFFSETS } from '../layouts/us-qwerty';
import { ThemePalette } from '../../../services/theme.service';

const ALL_KEYS: KeyString[] = [
  'q','w','e','r','t','y','u','i','o','p',
  'a','s','d','f','g','h','j','k','l',';',
  'z','x','c','v','b','n','m',',','.','/'
];

// Card padding around the key grid
const CARD_PADDING = 12;

// Diagonal offset per depth level (pixels)
const DEPTH_OFFSET_X = 3;
const DEPTH_OFFSET_Y = 3;

export interface CardRenderConfig {
  depth: number;
  palette: ThemePalette;
  heldKeyString?: KeyString;
}

export function getCardBackgroundColor(depth: number, palette: ThemePalette): string {
  const backgrounds = palette.cardBackgrounds;
  return backgrounds[Math.min(depth, backgrounds.length - 1)];
}

export function getCardDimensions(): { width: number; height: number } {
  const lastRowLastKey = xAndYForKeys['/'];
  return {
    width: lastRowLastKey.x + KEY_WIDTH + CARD_PADDING * 2,
    height: lastRowLastKey.y + KEY_HEIGHT + CARD_PADDING * 2,
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
  const heldKeyString = config.heldKeyString;

  const shadowProps = {
    shadowColor: shadowColor,
    shadowBlur: 8,
    shadowOffset: { x: 3, y: 3 },
    shadowOpacity: 1,
    shadowEnabled: true,
  };

  if (heldKeyString && xAndYForKeys[heldKeyString]) {
    const holePos = xAndYForKeys[heldKeyString];
    const hx = holePos.x;
    const hy = holePos.y;

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
        // Hole rect — counterclockwise (opposite winding = hole with nonzero rule)
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx, hy + KEY_HEIGHT);
        ctx.lineTo(hx + KEY_WIDTH, hy + KEY_HEIGHT);
        ctx.lineTo(hx + KEY_WIDTH, hy);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
      fill: fillColor,
      width: cardWidth,
      height: cardHeight,
      ...shadowProps,
    });
  }

  return new Konva.Shape({
    sceneFunc: (ctx, shape) => {
      ctx.beginPath();
      const x0 = -CARD_PADDING;
      const y0 = -CARD_PADDING;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + cardWidth, y0);
      ctx.lineTo(x0 + cardWidth, y0 + cardHeight);
      ctx.lineTo(x0, y0 + cardHeight);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    },
    fill: fillColor,
    width: cardWidth,
    height: cardHeight,
    ...shadowProps,
  });
}

export interface BlankKeyConfig {
  keyString: KeyString;
  palette: ThemePalette;
}

export function createBlankKey(config: BlankKeyConfig): Konva.Group {
  const pos = xAndYForKeys[config.keyString];
  const group = new Konva.Group({ x: pos.x, y: pos.y });

  group.add(new Konva.Rect({
    width: KEY_WIDTH,
    height: KEY_HEIGHT,
    fill: config.palette.blankKeyFill,
    stroke: config.palette.blankKeyStroke,
    strokeWidth: 1,
    dash: [4, 4],
  }));

  return group;
}

/**
 * Returns the set of KeyStrings that should be rendered as blank keys
 * (all positions minus bound keys and the held key).
 */
export function getBlankKeyPositions(
  boundKeys: Set<KeyString>,
  heldKeyString?: KeyString
): KeyString[] {
  return ALL_KEYS.filter(k => !boundKeys.has(k) && k !== heldKeyString);
}

export { ALL_KEYS, CARD_PADDING };
