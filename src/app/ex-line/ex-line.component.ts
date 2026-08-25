import {Component, ElementRef, EventEmitter, Input, Output, ViewChild} from '@angular/core';

/**
 * The ex line (da-165): vim's `:` command line, docked at the bottom of the
 * window. Opening it hands the keyboard to a native input, so the keymenu
 * stays out of the way while a command is being typed (see the
 * input-focus guard in KeymenuComponent).
 *
 * Enter submits, Escape cancels; either way the line closes and the keymenu
 * takes the keyboard back. History is walked with Up/Down, as in vim.
 */
@Component({
  selector: 'app-ex-line',
  imports: [],
  templateUrl: './ex-line.component.html',
  styleUrl: './ex-line.component.css',
})
export class ExLineComponent {
  @Input() dark = false;
  /** Feedback from the last command, shown until the next one opens. */
  @Input() message = '';
  /** Commands run so far, oldest first. Owned by the host: the line itself
   *  is destroyed between uses, so it cannot hold history of its own. */
  @Input() history: string[] = [];

  @Output() submitCommand = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('field') private field?: ElementRef<HTMLInputElement>;

  text = '';

  /** Index into history while browsing it; -1 means "on the live line". */
  private historyIndex = -1;

  /** Focus the field and start from an empty line. Called by AppComponent
   *  after the line is rendered. */
  open(): void {
    this.text = '';
    this.historyIndex = -1;
    // The element only exists once the @if block has rendered.
    setTimeout(() => this.field?.nativeElement.focus(), 0);
  }

  onKeyDown(event: KeyboardEvent): void {
    // The keymenu ignores events from inputs, but the browser and any
    // ancestor listeners should not act on these either.
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      const command = this.text.trim();
      if (command !== '') {
        this.submitCommand.emit(command);
      } else {
        this.cancel.emit();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel.emit();
      return;
    }

    // Backspacing off the end of an empty line closes it, as vim does.
    if (event.key === 'Backspace' && this.text === '') {
      event.preventDefault();
      this.cancel.emit();
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.walkHistory(event.key === 'ArrowUp' ? 1 : -1);
    }
  }

  /** Step `direction` entries back (1) or forward (-1) through history. */
  private walkHistory(direction: number): void {
    if (this.history.length === 0) return;
    const next = this.historyIndex + direction;
    if (next < 0) {
      this.historyIndex = -1;
      this.text = '';
      return;
    }
    if (next >= this.history.length) return;
    this.historyIndex = next;
    this.text = this.history[this.history.length - 1 - next];
  }
}
