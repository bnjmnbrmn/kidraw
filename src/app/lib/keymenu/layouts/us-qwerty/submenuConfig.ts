import { KeyString } from './keyString';

export class LabeledAction {
  /** `repeat: false` marks a one-shot action (opens a dialog, reloads, …)
   *  that must not fire again while the key is held — see
   *  RepeatConfig.enabled for the submenu-wide equivalent. */
  constructor(public actionLabel: string,
              public action: () => void,
              public repeat: boolean = true) {
  }
}

export class LabeledActionWithRelease {
  constructor(public actionLabel: string,
              public action: () => void,
              public onRelease: () => void) {
  }
}

/**
 * A key physically held on a card underneath this one. The upper card cuts a
 * hole at this position and draws only a release cue, leaving the original
 * key visible below. Event handling belongs to the interaction surface that
 * opened the card.
 */
export class LabeledHeldKeyRelease {
  constructor(public actionLabel: string) {
  }
}

export class LabeledSubmenuConfig {
  constructor(public submenuLabel: string,
              public submenuConfig: SubmenuConfig) {
  }
}

export class LabeledActionSubmenuConfig {
  constructor(public submenuLabel: string,
              public submenuConfig: SubmenuConfig,
              public action: () => void) {
  }
}

export type SubmenuConfigValue =
  | LabeledAction
  | LabeledActionWithRelease
  | LabeledHeldKeyRelease
  | LabeledSubmenuConfig
  | LabeledActionSubmenuConfig;

export interface RepeatConfig {
  initialDelayMs?: number;
  intervalMs?: number;
  /** Set to false to disable held-key auto-repeat for the whole submenu.
   *  One-shot actions (file dialogs, page reload, …) must not repeat: a
   *  blocking dialog swallows the keyup, so the repeat timer keeps firing
   *  and stacks dialogs. */
  enabled?: boolean;
}

export type SubmenuConfig = {
  [K in KeyString]?: SubmenuConfigValue
} & {
  _repeatConfig?: RepeatConfig;
}
