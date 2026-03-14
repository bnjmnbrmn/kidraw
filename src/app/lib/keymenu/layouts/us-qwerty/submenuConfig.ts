import { KeyString } from './keyString';

export class LabeledAction {
  constructor(public actionLabel: string, public action: () => void) {
  }
}

export class LabeledActionWithRelease {
  constructor(public actionLabel: string,
              public action: () => void,
              public onRelease: () => void) {
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
  | LabeledSubmenuConfig
  | LabeledActionSubmenuConfig;

export interface RepeatConfig {
  initialDelayMs: number;
  intervalMs: number;
}

export type SubmenuConfig = {
  [K in KeyString]?: SubmenuConfigValue
} & {
  _repeatConfig?: RepeatConfig;
}
