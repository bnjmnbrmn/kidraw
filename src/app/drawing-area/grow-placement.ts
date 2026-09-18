import type {DANode} from './da-node';
import type {NodeShape} from './command.model';
import type {PlacementAxis} from './quick-add-spacing';
import type {Point} from './utils';

export type GrowPlacementDirection = 'left' | 'right' | 'up' | 'down';

/** The small part of the held-Add gesture that places a new node freely. */
export interface GrowPlacementHost {
  readonly anchor: DANode | null;
  readonly origin: Point;
  spacing(axis: PlacementAxis): number;
  coarseModifierHeld(): boolean;
  fineModifierHeld(): boolean;
  redraw(): void;
}

/**
 * State machine for the free-placement part of grow mode.
 *
 * The component still owns the surrounding grow session and its commit side
 * effects. This object owns the placement facts themselves: which shape was
 * picked, where the ghost is, whether the first directional throw happened,
 * and which step modifier is held.
 */
export class GrowPlacement {
  private _placing = false;
  private _shape: NodeShape | undefined;
  private _position: Point | null = null;
  private _rough = false;
  private _modifiers = new Set<string>();

  constructor(private readonly host: GrowPlacementHost) {}

  get placing(): boolean {
    return this._placing;
  }

  set placing(value: boolean) {
    this._placing = value;
  }

  get shape(): NodeShape | undefined {
    return this._shape;
  }

  set shape(value: NodeShape | undefined) {
    this._shape = value;
  }

  get position(): Point | null {
    return this._position;
  }

  set position(value: Point | null) {
    this._position = value;
  }

  get rough(): boolean {
    return this._rough;
  }

  set rough(value: boolean) {
    this._rough = value;
  }

  get modifiers(): Set<string> {
    return this._modifiers;
  }

  set modifiers(value: Set<string>) {
    this._modifiers = value;
  }

  /** Enter placement at the usual beside-anchor position. */
  enter(shape: NodeShape): void {
    this._placing = true;
    this._shape = shape;
    this._rough = false;
    this._modifiers.clear();
    const origin = this.host.origin;
    this._position = this.host.anchor
      ? {x: origin.x + this.host.spacing('x'), y: origin.y}
      : {...origin};
  }

  /** Move the ghost, throwing it one full spacing on the first press. */
  move(direction: GrowPlacementDirection): void {
    const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    if (!this._rough) {
      this._rough = true;
      const axis = dy !== 0 ? 'y' : 'x';
      const distance = this.host.spacing(axis);
      const origin = this.host.origin;
      this._position = {x: origin.x + dx * distance, y: origin.y + dy * distance};
    } else {
      const axis = dy !== 0 ? 'y' : 'x';
      const step = this.step(axis);
      const position = this._position ?? this.host.origin;
      this._position = {x: position.x + dx * step, y: position.y + dy * step};
    }
    this.host.redraw();
  }

  addModifier(key: string): void {
    this._modifiers.add(key);
  }

  removeModifier(key: string): void {
    this._modifiers.delete(key);
  }

  private step(axis: PlacementAxis): number {
    if (this.host.coarseModifierHeld() || this._modifiers.has('coarse')) {
      return this.host.spacing(axis);
    }
    if (this.host.fineModifierHeld() || this._modifiers.has('fine')) return 10;
    return 50;
  }
}
