import {Group} from "konva/lib/Group";
import {KeyMenu} from "../keyMenu";
import {KeyMenuMode} from "../keyMenuMode";
import Konva from 'konva';
import {DACommandType} from '../../../drawing-area/command.model';
import {KeyMenuModeConfig} from '../keyMenuModeConfig';

export class PrintedInstructionKeyMenuModeConfig<T> implements KeyMenuModeConfig<T, PrintedInstructionKMMode<T>> {
    constructor(public instructions: string,
                public keyDownConfig: (event: KeyboardEvent) => void,
                public keyUpConfig: (event: KeyboardEvent) => void) {
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
        this.konvaGroup.add(new Konva.Text({
          text: printedInstructionKMModeConfig.instructions,
            fontSize: 20
        }));


        this.konvaGroup.x((this.keyMenu.containingHTMLElement.offsetWidth - this.konvaGroup.getClientRect().width) / 2)
        this.konvaGroup.y(20)
    }

    handleKeyDown(event: KeyboardEvent): void {
        console.log(this.constructor.name + " received " + event.key + " down")
        this.printedInstructionKMModeConfig.keyDownConfig(event);

    }

    handleKeyUp(event: KeyboardEvent): void {
        console.log(this.constructor.name + " received " + event.key + " up")
        this.printedInstructionKMModeConfig.keyUpConfig(event);
    }
}
