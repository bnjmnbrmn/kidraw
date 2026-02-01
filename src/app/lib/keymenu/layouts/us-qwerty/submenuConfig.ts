import { KeyString } from './keyString';

export class LabeledAction {
  constructor(public actionLabel: string, public action: () => void) {
  }
}

export class LabeledSubmenuConfig {
  constructor(public submenuLabel: string,
              public submenuConfig: SubmenuConfig) {
  }
}

export type SubmenuConfig = {
  [K in KeyString]?: LabeledAction | LabeledSubmenuConfig
}
