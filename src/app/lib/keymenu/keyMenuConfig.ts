import {KeyMenuModeConfig} from './keyMenuModeConfig';
import {KeyMenuMode} from "./keyMenuMode";

export interface KeyMenuConfig<T> {
  containerId: string,
  containingHTMLElement: HTMLElement,
  modes: {[name: string]: KeyMenuModeConfig<T, KeyMenuMode<T>>}
}


