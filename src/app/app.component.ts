import {Component, inject, ViewChild} from '@angular/core';
import {HeaderComponent} from './header/header.component';
import {DrawingAreaComponent} from './drawing-area/drawing-area.component';
import {KeymenuComponent} from './keymenu/keymenu.component';
import {Subject} from 'rxjs';
import {DACommand} from './drawing-area/command.model';
import {DANotification} from './drawing-area/da-notification.model';
import {DebugLogService} from './services/debug-log.service';

@Component({
  selector: 'app-root',
  imports: [HeaderComponent, DrawingAreaComponent, KeymenuComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private log = inject(DebugLogService);

  @ViewChild(KeymenuComponent) keymenuComponent!: KeymenuComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;

  movementSpeed = 50;
  canEdit = false;

  commandsSubject: Subject<DACommand> = new Subject<DACommand>();

  onCanEditChange(canEdit: boolean) {
    this.canEdit = canEdit;
  }

  relayKeymenuCommand(kmCommand: DACommand) {
    this.log.log("app component kmCommand: " + JSON.stringify(kmCommand))
    this.commandsSubject.next(kmCommand);
  }

  handleDANotification(daNotification: DANotification) {

    switch (daNotification.kind) {
      case "started-label-editing-mode":
        this.keymenuComponent['keyMenu'].switchMode('labelEdit');
        break;
      case "exit-label-editing-mode":
        this.keymenuComponent['keyMenu'].switchMode('normal');
        break;
    }
  }

  onZoomLevelChange(level: number) {
    if (this.headerComponent) {
      this.headerComponent.onZoomLevelChange(level);
    }
  }

  onWaypointsVisibleChange(visible: boolean) {
    if (this.headerComponent) {
      this.headerComponent.onWaypointsVisibleChange(visible);
    }
  }

  onMovementSpeedChange(speed: number) {
    this.movementSpeed = speed;
  }
}
