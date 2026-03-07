import {KeyMenuModeConfig} from './keyMenuModeConfig';
import {KeyMenuMode} from "./keyMenuMode";

export type KeyMenuModeConfigs<T, ModeName extends string = string> = {
  [name in ModeName]: KeyMenuModeConfig<T, KeyMenuMode<T>>;
};

export interface KeyMenuConfig<T, ModeName extends string = string> {
  containerId: string;
  containingHTMLElement: HTMLElement;
  modes: KeyMenuModeConfigs<T, ModeName>;
  initialModeName?: ModeName;
  stageBackground?: string;
}


