import {KeyMenuLayer} from './keyMenuLayer';
import {KeyMenu} from './keyMenu';

export interface KeyMenuMode<T> {
  name: string;
  handleKeyDown(event: KeyboardEvent): void;

  handleKeyUp(event: KeyboardEvent): void;

  get keyMenu(): KeyMenu<T>;

  set keyMenu(keyMenu: KeyMenu<T>);

  updateLayer(layer: KeyMenuLayer): void;
}
