import {KeyMenuMode} from './keyMenuMode';
import {KeyMenu} from './keyMenu';

export interface KeyMenuModeConfig<T, M extends KeyMenuMode<T>> {
  createMode(name: string, keyMenu: KeyMenu<T>): M;
}
