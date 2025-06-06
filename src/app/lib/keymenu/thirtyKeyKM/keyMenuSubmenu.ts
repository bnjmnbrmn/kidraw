import {KeyMenuLayer} from '../keyMenuLayer';
import {KMKeyConfig} from './KMKeyConfig';

export interface KeyMenuSubmenu {

  handleKeyDown(event: KeyboardEvent): void;

  handleKeyUp(event: KeyboardEvent): void;

}
