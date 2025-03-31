import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {HeaderComponent} from './header/header.component';
import {DrawingAreaComponent} from './drawing-area/drawing-area.component';
import {KeymenuComponent} from './keymenu/keymenu.component';
import {Subject} from 'rxjs';
import {Command} from './drawing-area/command.model';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, DrawingAreaComponent, KeymenuComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {

  commandsSubject: Subject<Command> = new Subject<Command>();

  relayKeymenuCommand(kmCommand: Command) {
    console.log("kmCommand: " + kmCommand)
    this.commandsSubject.next(kmCommand);
  }
}
