import {KeyMenu} from './keyMenu';
import Konva from 'konva';

export interface KeyMenuMode<T> {
  name: string;
  keyMenu: KeyMenu<T>;
  konvaGroup: Konva.Group;
  handleKeyDown(event: KeyboardEvent): void;
  handleKeyUp(event: KeyboardEvent): void;

  beforeSwitchOut(): void;

  beforeSwitchIn(): void;

  cancelInputState?(): void;
}
