import { Component, inject } from '@angular/core';
import { ThemeService } from '../services/theme.service';
import { KeyboardConfigService } from '../services/keyboard-config.service';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  zoomLevel: number = 100;
  waypointsVisible: boolean = false;

  themeService = inject(ThemeService);
  keyboardConfig = inject(KeyboardConfigService);

  onZoomLevelChange(level: number) {
    this.zoomLevel = level;
  }

  onWaypointsVisibleChange(visible: boolean) {
    this.waypointsVisible = visible;
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  onCapsLockSwapChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.keyboardConfig.capsLockCtrlSwap = checked;
  }
}
