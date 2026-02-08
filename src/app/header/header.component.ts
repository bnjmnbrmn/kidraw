import { Component } from '@angular/core';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  zoomLevel: number = 100;
  waypointsVisible: boolean = false;

  onZoomLevelChange(level: number) {
    this.zoomLevel = level;
  }

  onWaypointsVisibleChange(visible: boolean) {
    this.waypointsVisible = visible;
  }
}
