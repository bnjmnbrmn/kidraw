let _counter = 0;

export function nextId(): string {
  return `da-${++_counter}`;
}

export function resetIdCounter(aboveMax = 0): void {
  _counter = aboveMax;
}

export function currentIdCounter(): number {
  return _counter;
}
