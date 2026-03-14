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
  movementDistance: number;
  fineDistance: number;
  mediumDistance: number;
  largeDistance: number;
  initialRepeatDelayMs: number;
  repeatIntervalMs: number;
}

export interface VisualConfig {
  slideAnimation: SlideAnimationConfig;
  cardDepth: CardDepthConfig;
  cardShadow: CardShadowConfig;
  cursor: CursorConfig;
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
    movementDistance: 20,
    fineDistance: 5,
    mediumDistance: 50,
    largeDistance: 200,
    initialRepeatDelayMs: 0,
    repeatIntervalMs: 100,
  },
};
