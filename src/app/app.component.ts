import {Component, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {HeaderComponent} from './header/header.component';
import {DrawingAreaComponent} from './drawing-area/drawing-area.component';
import {KeymenuComponent} from './keymenu/keymenu.component';
import {TuningPanelComponent} from './tuning-panel/tuning-panel.component';
import {Subject, Subscription} from 'rxjs';
import {DACommand, DACommandType} from './drawing-area/command.model';
import {DANotification} from './drawing-area/da-notification.model';
import {DebugLogService} from './services/debug-log.service';
import {KeyboardConfigService} from './services/keyboard-config.service';
import {KeymenuKeyAssignments, DEFAULT_KEYMENU_KEY_ASSIGNMENTS, VIM_KEYMENU_KEY_ASSIGNMENTS} from './keymenu/config/key-assignments';

@Component({
  selector: 'app-root',
  imports: [HeaderComponent, DrawingAreaComponent, KeymenuComponent, TuningPanelComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  private log = inject(DebugLogService);
  private keyboardConfig = inject(KeyboardConfigService);

  @ViewChild(KeymenuComponent) keymenuComponent!: KeymenuComponent;
  @ViewChild(HeaderComponent) headerComponent!: HeaderComponent;

  movementSpeed = 20;
  canEdit = false;
  keyAssignments: KeymenuKeyAssignments = this.profileToAssignments(this.keyboardConfig.keyProfile);

  private configSub?: Subscription;
  commandsSubject: Subject<DACommand> = new Subject<DACommand>();

  ngOnInit() {
    this.configSub = this.keyboardConfig.configChanged$.subscribe(() => {
      this.keyAssignments = this.profileToAssignments(this.keyboardConfig.keyProfile);
    });
  }

  ngOnDestroy() {
    this.configSub?.unsubscribe();
  }

  private profileToAssignments(profile: string): KeymenuKeyAssignments {
    return profile === 'default' ? DEFAULT_KEYMENU_KEY_ASSIGNMENTS : VIM_KEYMENU_KEY_ASSIGNMENTS;
  }

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
        this.keymenuComponent.enterLabelEditMode();
        if (this.headerComponent) this.headerComponent.mode = 'labelEdit';
        break;
      case "exit-label-editing-mode":
        this.keymenuComponent.exitToNormalMode();
        if (this.headerComponent) this.headerComponent.mode = 'normal';
        break;
    }
  }

  onZoomLevelChange(level: number) {
    if (this.headerComponent) {
      this.headerComponent.onZoomLevelChange(level);
    }
  }

  onMovementSpeedChange(speed: number) {
    this.movementSpeed = speed;
  }

  onLoadSampleGraph(graphId: string) {
    this.commandsSubject.next({kind: DACommandType.LOAD_SAMPLE_GRAPH, graphId});
  }
}
