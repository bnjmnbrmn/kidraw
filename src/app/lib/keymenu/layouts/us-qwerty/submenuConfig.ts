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

export type SubmenuConfigValue = LabeledAction | LabeledActionWithRelease | LabeledSubmenuConfig;

export type SubmenuConfig = {
  [K in KeyString]?: SubmenuConfigValue
}
