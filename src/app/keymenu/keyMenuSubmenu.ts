import {KeyMenuLayer} from './keyMenuLayer';

export interface KeyMenuSubmenu {
  updateLayer(layer: KeyMenuLayer): void;

  handleKeyDown(event: KeyboardEvent): void;

  handleKeyUp(event: KeyboardEvent): void;
}
