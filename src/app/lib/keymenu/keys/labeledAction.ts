export class LabeledAction {
  constructor(public actionLabel: string, public action: () => void) {
  }
}
