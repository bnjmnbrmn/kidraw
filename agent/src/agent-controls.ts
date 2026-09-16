import * as acp from '@agentclientprotocol/sdk';
import type { AgentOption, OptionChoice, ServerToTab, SignInPromptMessage } from './protocol.js';

/**
 * Agent settings a KiDraw tab may change.
 *
 * An ACP agent publishes its settings as `configOptions` on `session/new`, and
 * Codex puts its **sandbox mode** in that same list. Only the ids below are
 * passed on to the tab, so no tab can take a session out of read-only — the
 * one rule in this file that is about safety rather than tidiness.
 */
const TUNABLE_OPTIONS: readonly string[] = ['model', 'reasoning_effort'];

/** Signing in without a browser on the server: the user opens a page and types a code. */
const DEVICE_CODE_AUTH = 'chat-gpt-device-code';

/** What `AgentControls` needs from the session that owns it. */
export interface ControlsHost {
  /** Send to the tab, without recording it in the transcript. */
  send(message: ServerToTab): void;
  /** Send to the tab and keep it in the transcript, for a tab that resumes. */
  emit(message: ServerToTab): void;
  log(message: string): void;
  /** True while the agent is answering; settings don't move mid-turn. */
  isBusy(): boolean;
  /** Keep a login the agent just made, so the next session inherits it. */
  saveLogin(): void;
}

/**
 * The model picker and the sign-in flow for one session.
 *
 * Both ride on stock ACP rather than anything Codex-specific:
 * `session/set_config_option` changes a setting, and `authenticate` with the
 * device-code method starts a login. The agent then asks *us* to put a page
 * and a one-time code in front of the user (`elicitation/create` in URL mode),
 * which is why this holds an open request: it is not answered until the user
 * has finished signing in or has cancelled.
 */
export class AgentControls {
  private options: AgentOption[] = [];
  /** What the tab asked for before the session existed; applied once it does. */
  private preferred: OptionChoice[] = [];
  /** The agent advertises the device-code sign-in this panel can drive. */
  private deviceCodeOffered = false;
  /** A sign-in waiting on the user: what to show, and the agent's open request. */
  private signIn: { prompt: SignInPromptMessage; settle: (accepted: boolean) => void } | null = null;
  private signingIn = false;
  private context: acp.ClientContext | null = null;
  private sessionId: acp.SessionId | null = null;

  constructor(private readonly host: ControlsHost) {}

  /** The settings the tab may change, as last known. */
  get list(): AgentOption[] {
    return this.options;
  }

  get canSignIn(): boolean {
    return this.deviceCodeOffered;
  }

  /** A sign-in still waiting on the user, so a tab that reloads can be told again. */
  get pendingPrompt(): SignInPromptMessage | null {
    return this.signIn?.prompt ?? null;
  }

  /** What the tab asked for in `hello`, applied once the session exists. */
  prefer(choices: OptionChoice[]): void {
    this.preferred = choices;
  }

  /** Whether the agent offers the sign-in this panel can drive (from `initialize`). */
  readAuthMethods(methods: acp.InitializeResponse['authMethods']): void {
    this.deviceCodeOffered = (methods ?? []).some(method => method.id === DEVICE_CODE_AUTH);
  }

  /** Attach to a started session and take its settings as they stand. */
  attach(context: acp.ClientContext, session: acp.ActiveSession): void {
    this.context = context;
    this.sessionId = session.sessionId;
    this.read(session.newSessionResponse.configOptions);
  }

  /** Put the session on the model and effort the user last chose, before it takes a prompt. */
  async applyPreferred(): Promise<void> {
    const wanted = this.preferred;
    this.preferred = [];
    for (const choice of wanted) {
      const option = this.options.find(o => o.id === choice.id);
      if (!option || option.current === choice.value) continue;
      if (!option.choices.some(c => c.value === choice.value)) continue;
      try {
        await this.request(choice.id, choice.value);
      } catch (err) {
        // A model the account can no longer use shouldn't stop the session starting.
        this.host.log(`could not set ${choice.id}=${choice.value}: ${(err as Error).message}`);
      }
    }
  }

  async set(id: string, value: string): Promise<void> {
    const option = this.options.find(o => o.id === id);
    const choice = option?.choices.find(c => c.value === value);
    if (!option || !choice) {
      this.host.send({ type: 'error', message: `The agent has no "${id}" setting "${value}"` });
      this.host.send({ type: 'options', options: this.options });
      return;
    }
    if (this.host.isBusy()) {
      this.host.send({
        type: 'error',
        message: `Wait for the answer to finish, or stop it, before changing the ${option.name.toLowerCase()}`,
      });
      return;
    }
    try {
      await this.request(id, value);
      this.host.emit({ type: 'agent_activity', title: `${option.name}: ${choice.name}`, status: 'completed' });
    } catch (err) {
      this.host.emit({ type: 'error', message: `Couldn't change the ${option.name.toLowerCase()}: ${(err as Error).message}` });
    }
    this.host.send({ type: 'options', options: this.options });
  }

  /**
   * Sign this server's agent in to its provider, without a browser on the
   * server. `switchAccount` signs out first: `authenticate` returns straight
   * away when a login is already present, so signing out is the only way to
   * reach a different account.
   */
  async startSignIn(switchAccount: boolean): Promise<void> {
    const context = this.context;
    if (!context) {
      this.host.send({ type: 'error', message: 'Agent is not ready yet' });
      return;
    }
    if (!this.deviceCodeOffered) {
      this.host.send({ type: 'sign_in_done', ok: false, message: 'This agent cannot be signed in from the chat.' });
      return;
    }
    if (this.signingIn) {
      this.host.send({ type: 'error', message: 'A sign-in is already in progress' });
      return;
    }
    this.signingIn = true;
    try {
      if (switchAccount) await context.request(acp.methods.agent.logout, {});
      await context.request(acp.methods.agent.authenticate, { methodId: DEVICE_CODE_AUTH });
      // Sessions run on a copy of the login, so keep this one for the next session too.
      this.host.saveLogin();
      this.host.emit({ type: 'agent_activity', title: 'Signed in', status: 'completed' });
      this.host.send({ type: 'sign_in_done', ok: true, message: 'Signed in. New messages use this account.' });
    } catch (err) {
      // Never prompted and not a switch: the agent refused before the user saw anything.
      const message = this.signIn === null && !switchAccount
        ? `Sign-in didn't finish: ${(err as Error).message}`
        : `Sign-in failed: ${(err as Error).message}`;
      this.host.send({ type: 'sign_in_done', ok: false, message });
    } finally {
      this.signingIn = false;
      this.cancelSignIn();
    }
  }

  /** The agent asks us to put a sign-in page in front of the user. */
  onElicitation(params: acp.CreateElicitationRequest): Promise<acp.CreateElicitationResponse> {
    const declined: acp.CreateElicitationResponse = { action: 'decline', content: null };
    // KiDraw's chat shows a sign-in page and nothing else; it fills in no forms.
    if (params.mode !== 'url') return Promise.resolve(declined);
    const url = typeof params.url === 'string' ? params.url : '';
    if (!url) return Promise.resolve(declined);

    this.signIn?.settle(false);
    const message = typeof params.message === 'string' ? params.message : 'Sign in to continue.';
    const prompt: SignInPromptMessage = { type: 'sign_in_prompt', url, code: codeIn(message), message };
    return new Promise<acp.CreateElicitationResponse>(resolve => {
      this.signIn = {
        prompt,
        // Held open until the login completes (the agent notifies us) or the
        // user cancels; cancelling tells the agent to drop the device code.
        settle: accepted => {
          this.signIn = null;
          resolve(accepted ? { action: 'accept', content: null } : { action: 'cancel', content: null });
        },
      };
      this.host.send(prompt);
    });
  }

  /** The login finished; let the agent's open request through. */
  signInCompleted(): void {
    this.signIn?.settle(true);
  }

  /** Drop a sign-in still waiting on the user. Safe to call when there is none. */
  cancelSignIn(): void {
    this.signIn?.settle(false);
    this.signIn = null;
  }

  private async request(id: string, value: string): Promise<void> {
    const response = await this.context!.request(acp.methods.agent.session.setConfigOption, {
      sessionId: this.sessionId!, configId: id, value,
    });
    // The agent answers with the whole set: one change can move another (a
    // model that doesn't offer the effort level that was selected, say).
    this.read(response.configOptions);
  }

  /** Keep the settings the tab may change, in the order the agent lists them. */
  private read(configOptions: acp.SessionConfigOption[] | null | undefined): void {
    this.options = (configOptions ?? [])
      .filter(option => option.type === 'select' && TUNABLE_OPTIONS.includes(option.id))
      .map(option => ({
        id: option.id,
        name: option.name,
        current: String((option as acp.SessionConfigOption & { currentValue: unknown }).currentValue),
        choices: selectChoices(option as acp.SessionConfigOption & { options: acp.SessionConfigSelectOptions }),
      }));
  }
}

/** A select setting's choices, whether the agent groups them or not. */
function selectChoices(option: { options: acp.SessionConfigSelectOptions }): AgentOption['choices'] {
  const flat = option.options.flatMap(entry => ('group' in entry ? entry.options : [entry]));
  return flat.map(choice => ({
    value: choice.value,
    name: choice.name,
    ...(choice.description ? { description: choice.description } : {}),
  }));
}

/** The one-time code out of "…enter this code: ABCD-EFGH", for showing on its own. */
function codeIn(message: string): string | null {
  return /code:\s*([A-Za-z0-9][A-Za-z0-9-]{3,})/.exec(message)?.[1] ?? null;
}
