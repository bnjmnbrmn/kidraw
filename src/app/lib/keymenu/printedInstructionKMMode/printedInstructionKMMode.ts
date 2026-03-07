import {Group} from "konva/lib/Group";
import {KeyMenu} from "../keyMenu";
import {KeyMenuMode} from "../keyMenuMode";
import Konva from 'konva';
import {KeyMenuModeConfig} from '../keyMenuModeConfig';
import {KeyString, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT} from '../layouts/us-qwerty';
import {ThemePalette} from '../../../services/theme.service';
import {createCardBackground, createBlankKey, CARD_PADDING} from '../rendering/cardRenderer';

// Letter keys in QWERTY order (the ones that type characters)
const LETTER_KEYS: KeyString[] = [
  'q','w','e','r','t','y','u','i','o','p',
  'a','s','d','f','g','h','j','k','l',';',
  'z','x','c','v','b','n','m',',','.','/'
];

export class PrintedInstructionKeyMenuModeConfig<T> implements KeyMenuModeConfig<T,
  PrintedInstructionKMMode<T>> {
  constructor(public instructions: string,
              public keyDownConfig: (event: KeyboardEvent) => void,
              public keyUpConfig: (event: KeyboardEvent) => void,
              public palette?: ThemePalette) {
  }

  createMode(name: string, keyMenu: KeyMenu<T>): PrintedInstructionKMMode<T> {
    return new PrintedInstructionKMMode<T>(name, keyMenu, this);
  }
}

export class PrintedInstructionKMMode<T> implements KeyMenuMode<T> {

  konvaGroup: Group;

  constructor(public name: string, public keyMenu: KeyMenu<T>,
              private printedInstructionKMModeConfig: PrintedInstructionKeyMenuModeConfig<T>) {
    this.konvaGroup = new Konva.Group();

    const palette = printedInstructionKMModeConfig.palette;

    if (palette) {
      // Card-based rendering
      this.buildCardView(palette);
    } else {
      // Fallback: plain text
      this.konvaGroup.add(new Konva.Text({
        text: printedInstructionKMModeConfig.instructions,
        fontSize: 20
      }));
    }

    this.konvaGroup.x((this.keyMenu.containingHTMLElement.offsetWidth - this.konvaGroup.getClientRect().width) / 2)
    this.konvaGroup.y(20)
  }

  private buildCardView(palette: ThemePalette) {
    // Card background
    const cardBg = createCardBackground({
      depth: 0,
      palette: {
        ...palette,
        cardBackgrounds: [palette.labelEditCardBackground, ...palette.cardBackgrounds],
      },
    });
    this.konvaGroup.add(cardBg);

    // Render each letter key showing its character
    for (const keyString of LETTER_KEYS) {
      const pos = xAndYForKeys[keyString];
      const keyGroup = new Konva.Group({ x: pos.x, y: pos.y });

      keyGroup.add(new Konva.Rect({
        width: KEY_WIDTH,
        height: KEY_HEIGHT,
        fill: palette.labelEditKeyFill,
        stroke: palette.labelEditKeyStroke,
        strokeWidth: 1,
      }));

      // Show the character this key types
      keyGroup.add(new Konva.Text({
        text: keyString,
        width: KEY_WIDTH,
        height: KEY_HEIGHT,
        align: 'center',
        verticalAlign: 'middle',
        fontSize: 18,
        fill: palette.labelEditText,
      }));

      this.konvaGroup.add(keyGroup);
    }

    // Instruction text below the card
    const lastRowLastKey = xAndYForKeys['/'];
    const instructionY = lastRowLastKey.y + KEY_HEIGHT + CARD_PADDING + 10;

    this.konvaGroup.add(new Konva.Text({
      text: this.printedInstructionKMModeConfig.instructions,
      y: instructionY,
      x: -CARD_PADDING,
      fontSize: 14,
      fill: palette.instructionText,
      width: lastRowLastKey.x + KEY_WIDTH + CARD_PADDING * 2,
      align: 'center',
    }));
  }

  beforeSwitchOut(): void {
    //do nothing
  }

  beforeSwitchIn() {
    //do nothing
  }

  handleKeyDown(event: KeyboardEvent): void {
    this.printedInstructionKMModeConfig.keyDownConfig(event);

  }

  handleKeyUp(event: KeyboardEvent): void {
    this.printedInstructionKMModeConfig.keyUpConfig(event);
  }
}
