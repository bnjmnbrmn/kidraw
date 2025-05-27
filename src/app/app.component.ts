import {Component, ViewChild} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {HeaderComponent} from './header/header.component';
import {DrawingAreaComponent} from './drawing-area/drawing-area.component';
import {KeymenuComponent} from './keymenu/keymenu.component';
import {Subject} from 'rxjs';
import {DACommand} from './drawing-area/command.model';
import {DANotification} from './drawing-area/da-notification.model';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, DrawingAreaComponent, KeymenuComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {

  @ViewChild(KeymenuComponent) keymenuComponent!: KeymenuComponent;

  commandsSubject: Subject<DACommand> = new Subject<DACommand>();

  relayKeymenuCommand(kmCommand: DACommand) {
    console.log("app component kmCommand: " + JSON.stringify(kmCommand))
    this.commandsSubject.next(kmCommand);
  }

  handleDANotification(daNotification: DANotification) {

    // switch (daNotification.kind) {
    //   case "started-label-editing-mode":
    //     break;
    //   case "started-select-mode":
    //     break;
    // }
  }
}
