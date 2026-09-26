import {computed, inject, Injectable, Injector, signal} from '@angular/core';
import type {CanvasPort, CanvasNode} from '../drawing-area/canvas-port';
import type {AgentOption, CanvasRef, DetailLevel} from './agent-protocol';
import {AgentEndpointSettings, AgentSettingsService} from './agent-settings.service';
import type {AgentService} from './agent.service';
import {ChatDraft} from './chat-draft';
import {hasStoredSession} from './stored-session';

export type AgentState = 'off' | 'setup' | 'consent' | 'connecting' | 'ready' | 'error';

export interface ChatMessage {
  id: number;
  role: 'user' | 'agent' | 'activity' | 'error';
  text: string;
  refs?: CanvasRef[];
  /** True while an agent reply is still streaming. */
  streaming?: boolean;
}

export interface AgentCaption {
  id: number;
  nodeId: string;
  label: string;
  text: string;
}

/** Width the open chat panel occupies on the right, counted into the drawing
 *  area's viewport inset. */
export const AGENT_PANEL_WIDTH = 340;

export interface GraphIdentity {
  /** Stable key for consent, e.g. vault + path. */
  key: string;
  title: string;
  /** False for a graph with no lasting identity (Untitled), so "always share"
   *  can't be remembered for it. */
  stable: boolean;
}

/** Key labels for hints, set by the shell from the active key profile. */
export interface AgentKeyLabels {
  chat: string;
  ask: string;
  follow: string;
  close: string;
}

/** Who ends up processing the graph, per agent, for the consent prompt. */
const AGENT_PROVIDERS: Record<string, string> = {codex: 'Codex (OpenAI)'};

/**
 * Agent mode's always-loaded half: the state the header and shell render, and
 * entry points that load the rest (AgentService: connection, consent, chat,
 * tools) the first time they're needed. A tab that never uses agent mode
 * downloads only this, which keeps the initial bundle inside its budget.
 */
@Injectable({providedIn: 'root'})
export class AgentStore {
  private readonly settings = inject(AgentSettingsService);
  private readonly injector = inject(Injector);

  readonly state = signal<AgentState>('off');
  readonly panelOpen = signal(false);
  readonly messages = signal<ChatMessage[]>([]);
  readonly busy = signal(false);
  /** 'free' once the user moves the view themselves. */
  readonly followMode = signal<'following' | 'free'>('following');
  readonly captions = signal<AgentCaption[]>([]);
  readonly lookHere = signal<CanvasNode | null>(null);
  readonly attachedRefs = signal<CanvasRef[]>([]);
  /** Progress under the transcript (connecting, reconnecting). Errors go in the transcript. */
  readonly statusText = signal('');
  /** Incremented to ask the panel to put the cursor somewhere useful. */
  readonly focusInputTick = signal(0);
  readonly graphTitle = signal('');
  /** The user opened a graph this session wasn't given; tools are paused until they answer. */
  readonly graphChange = signal<GraphIdentity | null>(null);
  /** Set while retrying a dropped connection. */
  readonly reconnecting = signal<{attempt: number; of: number} | null>(null);
  /** The chat, not the canvas, has the keyboard; the shell suspends the keymenu. */
  readonly keyboardInPanel = signal(false);
  /** Short messages for the header, which is visible even with the panel closed. */
  readonly notice = signal<{text: string; seq: number} | null>(null);
  readonly keyLabels = signal<AgentKeyLabels>({chat: 'm', ask: 'o', follow: 'Shift+O', close: 'Shift+M'});
  /** A failure happened while the panel was closed; the header says so until it is opened. */
  readonly unseenFailure = signal(false);
  /** The change set of the agent's most recent turn that changed the graph, for "undo its last turn". */
  readonly agentEditTurn = signal<string | null>(null);
  /** The agent settings this chat can change (model, reasoning effort). */
  readonly agentOptions = signal<AgentOption[]>([]);
  /** The server's agent can be signed in to its provider from this chat. */
  readonly canSignIn = signal(false);
  /** A sign-in waiting for the user to open a page and enter a code. */
  readonly signInPrompt = signal<{url: string; code: string | null; message: string} | null>(null);
  /** A sign-in the user started that hasn't finished or failed yet. */
  readonly signingIn = signal(false);
  /** The message being written in the chat, edited through the keymenu's label-editing modes. */
  readonly draft = new ChatDraft();
  /** How much detail explanations should have; sent with every prompt. */
  readonly detailLevel = signal<DetailLevel>(this.settings.detailLevel);

  readonly endpoint = signal<AgentEndpointSettings | null>(this.settings.endpoint);
  readonly endpointName = computed(() => this.endpoint()?.name ?? '');
  readonly connected = computed(() => this.state() === 'ready');
  /** The chat can take a message now: what is typed goes to the draft. */
  readonly composable = computed(() => this.state() === 'ready' && this.graphChange() === null && this.reconnecting() === null);
  readonly providerName = computed(() => {
    const agent = this.endpoint()?.agent ?? '';
    return AGENT_PROVIDERS[agent] ?? (agent || 'the agent');
  });
  /** Working, but nothing has streamed yet. */
  readonly thinking = computed(() => {
    if (!this.busy()) return false;
    const list = this.messages();
    const last = list[list.length - 1];
    return !(last?.role === 'agent' && last.streaming);
  });

  private service: AgentService | null = null;
  private loading: Promise<AgentService> | null = null;
  private keyboardListener: ((chatHasKeyboard: boolean) => void) | null = null;
  private attachment: {
    canvas: CanvasPort;
    graph: () => GraphIdentity;
    userIsEditing: () => boolean;
  } | null = null;

  /** See AgentService.attachCanvas. Loads agent mode now only if this tab has a session to resume. */
  attachCanvas(canvas: CanvasPort, graph: () => GraphIdentity, userIsEditing: () => boolean): void {
    this.attachment = {canvas, graph, userIsEditing};
    if (this.service) this.service.attachCanvas(canvas, graph, userIsEditing);
    else if (hasStoredSession()) void this.load();
  }

  /** The shell's hook for suspending the keymenu while the chat has the keyboard. */
  onKeyboardOwnerChange(listener: (chatHasKeyboard: boolean) => void): void {
    this.keyboardListener = listener;
  }

  /** Give the keyboard to the chat or back to the canvas. Synchronous on
   *  purpose, not an effect: effects run on the next frame, and a key pressed
   *  right after Esc must already reach the keymenu. */
  setKeyboardInPanel(inPanel: boolean): void {
    this.keyboardInPanel.set(inPanel);
    this.keyboardListener?.(inPanel && this.panelOpen());
  }

  openPanel(): void {
    // Take the keyboard now, so nothing typed while the chat loads reaches the canvas.
    this.panelOpen.set(true);
    this.setKeyboardInPanel(true);
    void this.load().then(service => service.openPanel());
  }

  closePanel(): void {
    if (this.service) {
      this.service.closePanel();
    } else {
      this.panelOpen.set(false);
      this.setKeyboardInPanel(false);
    }
  }

  askAboutSelection(): void {
    void this.load().then(service => service.askAboutSelection());
  }

  /** Open the chat with `refs` attached and `text` ready to edit and send:
   *  the reader points at the step that bothers them instead of quoting it. */
  prefillFeedback(text: string, refs: CanvasRef[]): void {
    this.attachedRefs.set(refs);
    this.draft.set(text);
    this.openPanel();
  }

  /** Remembered in this browser; the agent hears about it with the next message. */
  setDetailLevel(level: DetailLevel): void {
    this.detailLevel.set(level);
    this.settings.saveDetailLevel(level);
  }

  follow(): void {
    if (this.service) this.service.follow();
    else this.say('No agent is connected');
  }

  userTookViewControl(): void {
    this.service?.userTookViewControl();
  }

  graphMayHaveChanged(): void {
    this.service?.graphMayHaveChanged();
  }

  /** AI Chat was turned off in Settings: close the chat and end any session
   *  (the server drops it rather than keeping it for a resume). */
  shutDown(): void {
    this.closePanel();
    this.service?.disconnect();
  }

  say(text: string): void {
    this.notice.set({text, seq: (this.notice()?.seq ?? 0) + 1});
  }

  private load(): Promise<AgentService> {
    this.loading ??= import('./agent.service').then(({AgentService}) => {
      const service = this.injector.get(AgentService);
      this.service = service;
      const attachment = this.attachment;
      if (attachment) service.attachCanvas(attachment.canvas, attachment.graph, attachment.userIsEditing);
      return service;
    });
    return this.loading;
  }
}
