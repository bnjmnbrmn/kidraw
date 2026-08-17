export interface SlideAnimationConfig {
  delayMs: number;
  inDurationS: number;
  outDurationS: number;
}

export interface CardDepthConfig {
  depthOffsetX: number;
  depthOffsetY: number;
}

export interface CardShadowConfig {
  baseBlur: number;
  baseOffset: number;
  perDepthBlurIncrement: number;
  perDepthOffsetIncrement: number;
}

export interface CursorConfig {
  gridSpacing: number;
  fineMovementGridSteps: number;
  normalMovementGridSteps: number;
  coarseMovementGridSteps: number;
  initialRepeatDelayMs: number;
  repeatIntervalMs: number;
  labelEditInitialDelayMs: number;
  labelEditIntervalMs: number;
}

export type CompactMenuSide = 'left' | 'right';

export interface CompactMenuConfig {
  /** Which edge of the drawing area the compact keymenu docks against. */
  side: CompactMenuSide;
  /** Panel width in px. The drawing area insets its usable viewport by this
   *  much on the docked side, so the panel never hides content the crosshairs
   *  are moving toward. */
  widthPx: number;
}

export interface VisualConfig {
  slideAnimation: SlideAnimationConfig;
  cardDepth: CardDepthConfig;
  cardShadow: CardShadowConfig;
  cursor: CursorConfig;
  compactMenu: CompactMenuConfig;
}

export const DEFAULT_VISUAL_CONFIG: VisualConfig = {
  slideAnimation: {
    delayMs: 0,
    inDurationS: 0.1,
    outDurationS: 0.1,
  },
  cardDepth: {
    depthOffsetX: 6,
    depthOffsetY: 6,
  },
  cardShadow: {
    baseBlur: 14,
    baseOffset: 5,
    perDepthBlurIncrement: 8,
    perDepthOffsetIncrement: 4,
  },
  cursor: {
    gridSpacing: 50,
    fineMovementGridSteps: 1,
    normalMovementGridSteps: 5,
    coarseMovementGridSteps: 10,
    initialRepeatDelayMs: 250,
    repeatIntervalMs: 100,
    labelEditInitialDelayMs: 400,
    labelEditIntervalMs: 50,
  },
  compactMenu: {
    side: 'right',
    widthPx: 268,
  },
};
