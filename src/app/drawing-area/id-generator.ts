let _counter = 0;

export function nextId(): string {
  return `da-${++_counter}`;
}

export function resetIdCounter(aboveMax = 0): void {
  _counter = aboveMax;
}

/** Make sure ids handed out later never collide with an existing `da-N` id.
 *  Unlike resetIdCounter, this only ever raises the counter. */
export function reserveId(id: string | undefined): void {
  if (!id) return;
  const num = parseInt(id.replace('da-', ''), 10);
  if (!isNaN(num) && num > _counter) _counter = num;
}

export function currentIdCounter(): number {
  return _counter;
}
