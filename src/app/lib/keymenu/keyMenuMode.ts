import {KeyMenuLayer} from './keyMenuLayer';
import {KeyMenu} from './keyMenu';

export interface KeyMenuMode<T> {
  handleKeyDown(event: KeyboardEvent): void;
  handleKeyUp(event: KeyboardEvent): void;
}
