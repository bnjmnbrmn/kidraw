import {DisplayableKey} from "./displayableKey";

export interface KMKeyConfig {
  displayableKey: DisplayableKey;
  label: string;
  action: () => void;
}
