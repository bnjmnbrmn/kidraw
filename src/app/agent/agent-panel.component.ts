import {Component, effect, ElementRef, HostListener, inject, Input, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AgentService, ChatMessage} from './agent.service';
import {hostOf} from './agent-settings.service';
import {parseRefSegments, RefSegment} from './agent-refs';

/** An absolute ws:// or wss:// address (http(s) is converted), or null. A
 *  relative string would otherwise resolve against this page's own server
 *  and hang instead of failing. */
export function endpointUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') url.protocol = 'wss:';
    else if (url.protocol === 'http:') url.protocol = 'ws:';
    return url.protocol === 'wss:' || url.protocol === 'ws:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The agent chat panel: setup, per-graph consent, transcript with reference
 * pills, and the prompt input. While it has the keyboard, AppComponent
 * suspends the keymenu (which then shows the chat's own keys), so nothing
 * typed here can reach the canvas. Escape, or Ctrl-[, always gives the
 * keyboard back.
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
  /** Height the keymenu occupies at the bottom; the panel stops above it so the keyboard stays in place. */
  @Input() bottomInset = 0;
  /** Extra right offset, e.g. a compact keymenu docked on the right. */
  @Input() rightOffset = 0;

  @ViewChild('panel') panel?: ElementRef<HTMLElement>;
  @ViewChild('promptInput') promptInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('transcript') transcript?: ElementRef<HTMLElement>;
  @ViewChild('setupUrlInput') setupUrlInput?: ElementRef<HTMLInputElement>;
  @ViewChild('consentFirst') consentFirst?: ElementRef<HTMLButtonElement>;
  @ViewChild('graphChangeFirst') graphChangeFirst?: ElementRef<HTMLButtonElement>;
  @ViewChild('retryButton') retryButton?: ElementRef<HTMLButtonElement>;

  draft = '';
  setupError = '';
  setupUrl = '';
  setupToken = '';
  setupName = '';

  constructor() {
    // Put the cursor where the next keystroke belongs when the chat takes the
    // keyboard or its content changes underneath it.
    effect(() => {
      this.agent.focusInputTick();
      this.agent.state();
      this.agent.graphChange();
      this.agent.reconnecting();
      setTimeout(() => this.focusBest(), 0);
    });
    effect(() => {
      if (this.agent.keyboardInPanel()) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && this.panel?.nativeElement.contains(active)) active.blur();
    });
    effect(() => {
      this.agent.messages();
      setTimeout(() => {
        const el = this.transcript?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      }, 0);
    });
    // Editing an endpoint starts from what is saved.
    effect(() => {
      if (this.agent.state() !== 'setup') return;
      const saved = this.agent.endpoint();
      this.setupUrl = saved?.url ?? '';
      this.setupToken = saved?.token ?? '';
      this.setupName = saved?.name ?? '';
    });
  }

  get keys() {
    return this.agent.keyLabels();
  }

  get suggestedUrl(): string {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${location.host}/agent/`;
  }

  get placeholder(): string {
    if (this.agent.reconnecting()) return 'Offline — reconnecting…';
    if (this.agent.state() === 'connecting') return 'Connecting…';
    if (this.agent.state() !== 'ready') return '';
    if (this.agent.graphChange()) return 'Share the graph above to continue';
    if (this.agent.busy()) return 'Answering… (Ctrl+C to stop, Esc for the canvas)';
    return 'Ask the agent (Enter to send, Esc for the canvas)';
  }

  segments(message: ChatMessage): RefSegment[] {
    return parseRefSegments(message.text);
  }

  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || (event.ctrlKey && event.key === '[')) {
      event.preventDefault();
      if (this.agent.state() === 'consent') this.agent.answerConsent('cancel');
      else if (this.agent.state() === 'setup') this.agent.closePanel();
      else this.handBackKeyboard();
      return;
    }
    const inTextField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (inTextField || event.ctrlKey || event.altKey || event.metaKey) return;
    const graphChange = this.agent.graphChange();
    if (this.agent.state() === 'consent') {
      if (event.key === '1') {
        event.preventDefault();
        this.agent.answerConsent('session');
      } else if (event.key === '2' && this.agent.currentGraph().stable) {
        event.preventDefault();
        this.agent.answerConsent('always');
      }
    } else if (graphChange) {
      if (event.key === '1') {
        event.preventDefault();
        this.agent.answerGraphChange('session');
      } else if (event.key === '2' && graphChange.stable) {
        event.preventDefault();
        this.agent.answerGraphChange('always');
      }
    }
  }

  onPromptKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
      return;
    }
    // Ctrl+C stops the answer, unless there is text selected to copy.
    if (event.ctrlKey && event.key.toLowerCase() === 'c' && this.agent.busy()) {
      const field = event.target as HTMLTextAreaElement;
      if (field.selectionStart === field.selectionEnd) {
        event.preventDefault();
        this.agent.cancel();
      }
    }
  }

  submit(): void {
    if (this.draft.trim() && this.agent.sendPrompt(this.draft)) this.draft = '';
  }

  saveSetup(): void {
    const url = endpointUrl(this.setupUrl.trim() || this.suggestedUrl);
    const token = this.setupToken.trim();
    if (!token) return;
    if (!url) {
      this.setupError = 'Enter a full address starting with wss:// (or ws:// for a server on this machine).';
      return;
    }
    this.setupError = '';
    this.agent.saveEndpoint({url, token, name: this.setupName.trim() || hostOf(url), agent: 'codex'});
  }

  /** A pill takes you to its node on the canvas, keyboard included. */
  focusRef(id: string): void {
    this.agent.focusRef(id);
    this.handBackKeyboard();
  }

  /** Give the keyboard back now rather than on the next render: the very
   *  next key must reach the canvas, not the text box that still has focus. */
  private handBackKeyboard(): void {
    this.agent.releaseKeyboard();
    const active = document.activeElement as HTMLElement | null;
    if (active && this.panel?.nativeElement.contains(active)) active.blur();
  }

  /** A click outside the panel hands the keyboard back to the canvas. */
  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (!this.agent.keyboardInPanel()) return;
    const panel = this.panel?.nativeElement;
    if (panel && !panel.contains(event.target as Node)) this.agent.releaseKeyboard();
  }

  /** Tabbing out releases the keyboard. Focus dropping to the page because a
   *  button just disappeared (e.g. after answering consent) does not. */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.panel && !this.panel.nativeElement.contains(next)) this.agent.releaseKeyboard();
  }

  private focusBest(): void {
    if (!this.agent.keyboardInPanel() || !this.agent.panelOpen()) return;
    const panel = this.panel?.nativeElement;
    const active = document.activeElement;
    // Leave the cursor alone if it is already on something in the panel.
    if (panel && active && active !== panel && panel.contains(active)) return;
    const target = this.setupUrlInput ?? this.consentFirst ?? this.graphChangeFirst
      ?? this.retryButton ?? this.promptInput ?? this.panel;
    target?.nativeElement.focus();
  }
}
