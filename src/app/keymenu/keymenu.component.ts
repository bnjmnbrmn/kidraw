import {Component, EventEmitter, HostListener, Output} from '@angular/core';

@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent {

  @Output() keymenuOut = new EventEmitter<string>;

  keyCommandMap: Map<string, string> = new Map(Object.entries({
    h: 'left',
    j: 'down',
    k: 'up',
    l: 'right',
  }));

  @HostListener('document:keydown', ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    const ek = event.key as string;
    if (this.keyCommandMap.has(ek)) {
      console.log("km: " + this.keyCommandMap.get(ek));
      this.keymenuOut.emit(this.keyCommandMap.get(ek))
    }

  }

}
