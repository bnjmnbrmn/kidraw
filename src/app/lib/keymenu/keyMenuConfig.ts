import {KeyMenuMode} from "./keyMenuMode";

export interface KeyMenuConfig<T> {
  containerId: string,
  containingHTMLElement: HTMLElement,
  modes: { [name: string]: KeyMenuMode<T> }
}
