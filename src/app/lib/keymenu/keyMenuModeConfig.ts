import {KeyMenuMode} from './keyMenuMode';

export interface KeyMenuModeConfig<T, M extends KeyMenuMode<T>> {
  createMode(): M;
}
