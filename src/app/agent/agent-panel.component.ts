import {Component, effect, ElementRef, inject, Input, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AgentService, ChatMessage} from './agent.service';
import {hostOf} from './agent-settings.service';
import {parseRefSegments, RefSegment} from './agent-refs';

/**
 * The agent chat panel: setup, per-graph consent, transcript with reference
 * pills, and the prompt input. Keys typed in its fields never reach the
 * keymenu (KeymenuComponent.isTypingInField); Escape hands the keyboard back
 * to the canvas.
 */
@Component({
  selector: 'app-agent-panel',
  imports: [FormsModule],
  templateUrl: './agent-panel.component.html',
  styleUrl: './agent-panel.component.css',
})
export class AgentPanelComponent {
  readonly agent = inject(AgentService);
  @Input() dark = false;
  @Input() chatKey = 'm';
  @Input() askKey = 'o';
  @Input() followKey = 't';

  @ViewChild('promptInput') promptInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('transcript') transcript?: ElementRef<HTMLElement>;

  draft = '';
  setupUrl = '';
  setupToken = '';
  setupName = '';

  constructor() {
    effect(() => {
      this.agent.focusInputTick();
      setTimeout(() => this.promptInput?.nativeElement.focus(), 0);
    });
    effect(() => {
      this.agent.messages();
      setTimeout(() => {
        const el = this.transcript?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      }, 0);
    });
  }

  get suggestedUrl(): string {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${location.host}/agent/`;
  }

  segments(message: ChatMessage): RefSegment[] {
    return parseRefSegments(message.text);
  }

  onPromptKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (this.agent.busy()) this.agent.cancel();
      else this.releaseKeyboard();
    }
  }

  submit(): void {
    if (!this.draft.trim() || this.agent.busy()) return;
    this.agent.sendPrompt(this.draft);
    this.draft = '';
  }

  saveSetup(): void {
    const url = this.setupUrl.trim() || this.suggestedUrl;
    const token = this.setupToken.trim();
    if (!token) return;
    this.agent.saveEndpoint({url, token, name: this.setupName.trim() || hostOf(url), agent: 'codex'});
    this.setupToken = '';
    this.releaseKeyboard();
  }

  /** Clicked buttons keep focus, and focused buttons swallow keymenu keys; give the keyboard back. */
  releaseKeyboard(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  focusRef(id: string): void {
    this.agent.focusRef(id);
    this.releaseKeyboard();
  }
}
