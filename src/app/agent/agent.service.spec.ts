import {TestBed} from '@angular/core/testing';
import {AgentCanvasTarget} from './agent-canvas';
import {AgentService, GraphIdentity} from './agent.service';

/** Stands in for the browser WebSocket so tests can open, feed and drop connections. */
class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  readonly sent: Record<string, any>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: {data: string}) => void) | null = null;
  onclose: ((event: {code: number; reason: string}) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(message: object): void {
    this.onmessage?.({data: JSON.stringify(message)});
  }

  drop(code = 1006, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({code, reason});
  }

  static latest(): FakeSocket {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }
}

const ENDPOINT = {url: 'wss://agent.example/agent/', token: 't0ken', name: 'test-server', agent: 'codex'};
const READY = {
  type: 'ready', agent: 'codex', session: {id: 'sess-1', secret: 'shh'}, resumed: false, busy: false, history: [],
};

function fakeCanvas(): jasmine.SpyObj<AgentCanvasTarget> {
  const canvas = jasmine.createSpyObj<AgentCanvasTarget>('canvas', [
    'agentNodes', 'agentEdges', 'agentSelection', 'agentVisibleNodeIds', 'agentZoomPercent',
    'agentFocusNode', 'agentSetHighlights', 'agentNodeClientRect', 'agentViewClientRect',
    'agentDiagramTypeId', 'agentApplyChanges', 'agentRevertChangeSet',
  ]);
  canvas.agentDiagramTypeId.and.returnValue('explanation');
  canvas.agentApplyChanges.and.resolveTo({ok: true, created: [{kind: 'node', id: 'da-9'}], touchedNodeIds: ['da-9']});
  canvas.agentRevertChangeSet.and.resolveTo(null);
  canvas.agentNodes.and.returnValue([{id: 'n1', label: 'Start', tags: []}, {id: 'n2', label: 'End', tags: []}]);
  canvas.agentEdges.and.returnValue([]);
  canvas.agentSelection.and.returnValue({nodeIds: ['n2'], edgeIds: [], underCrosshairsId: null});
  canvas.agentVisibleNodeIds.and.returnValue(['n1', 'n2']);
  canvas.agentZoomPercent.and.returnValue(100);
  canvas.agentFocusNode.and.returnValue(true);
  canvas.agentNodeClientRect.and.returnValue(null);
  canvas.agentViewClientRect.and.returnValue({left: 0, top: 0, width: 800, height: 600});
  return canvas;
}

/** Let the service's dynamic import of the tools and its promise chains settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('AgentService', () => {
  // Load the lazily imported tools once up front: on a slow host the first load
  // of that chunk can outlast settle(), which failed whichever tool test ran first.
  beforeAll(() => import('./agent-tools'), 60000);

  const realWebSocket = window.WebSocket;
  let graph: GraphIdentity;
  let editing: boolean;
  let canvas: jasmine.SpyObj<AgentCanvasTarget>;

  function createService(): AgentService {
    const service = TestBed.inject(AgentService);
    service.attachCanvas(canvas, () => graph, () => editing);
    return service;
  }

  /** Open the panel, share the graph for this session, and complete the handshake. */
  function connect(service: AgentService): FakeSocket {
    service.openPanel();
    service.answerConsent('session');
    const socket = FakeSocket.latest();
    socket.open();
    socket.receive(READY);
    return socket;
  }

  beforeEach(() => {
    FakeSocket.instances = [];
    (window as any).WebSocket = FakeSocket;
    localStorage.removeItem('kidraw_agent_consent_v1');
    localStorage.setItem('kidraw_agent_endpoint_v1', JSON.stringify(ENDPOINT));
    sessionStorage.removeItem('kidraw_agent_session_v1');
    graph = {key: 'vault:next.kidraw.yaml', title: 'next.kidraw.yaml', stable: true};
    editing = false;
    canvas = fakeCanvas();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    (window as any).WebSocket = realWebSocket;
    localStorage.removeItem('kidraw_agent_endpoint_v1');
    localStorage.removeItem('kidraw_agent_consent_v1');
    sessionStorage.removeItem('kidraw_agent_session_v1');
  });

  it('asks before sharing a graph, and connects only after consent', () => {
    const service = createService();
    service.openPanel();
    expect(service.state()).toBe('consent');
    expect(FakeSocket.instances.length).toBe(0);

    service.answerConsent('session');
    const socket = FakeSocket.latest();
    socket.open();
    expect(socket.sent[0]).toEqual(jasmine.objectContaining({type: 'hello', token: 't0ken', agent: 'codex'}));
    expect(socket.sent[0]['resume']).toBeUndefined();
    socket.receive(READY);
    expect(service.state()).toBe('ready');
  });

  it('does not remember "always" for a graph without a stable identity', () => {
    graph = {key: 'local:Untitled', title: 'Untitled', stable: false};
    const service = createService();
    service.openPanel();
    service.answerConsent('always');
    FakeSocket.latest().open();
    FakeSocket.latest().receive(READY);
    service.disconnect();

    service.openPanel();
    expect(service.state()).toBe('consent');
  });

  it('reconnects after a dropped connection and resumes the same session', () => {
    jasmine.clock().install();
    try {
      const service = createService();
      const first = connect(service);
      first.drop(1006);
      expect(service.state()).toBe('connecting');
      expect(service.reconnecting()).toEqual({attempt: 1, of: jasmine.any(Number)});

      jasmine.clock().tick(1_100);
      const second = FakeSocket.latest();
      expect(second).not.toBe(first);
      second.open();
      expect(second.sent[0]['resume']).toEqual({sessionId: 'sess-1', secret: 'shh'});
      second.receive({...READY, resumed: true, history: [{role: 'user', text: 'hi'}, {role: 'agent', text: 'hello'}]});
      expect(service.state()).toBe('ready');
      expect(service.reconnecting()).toBeNull();
      expect(service.messages().map(m => m.text)).toEqual(['hi', 'hello']);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('does not fight another tab that took the session over (4001), and forgets it', () => {
    jasmine.clock().install();
    try {
      const service = createService();
      const socket = connect(service);
      socket.drop(4001, 'Session continued in another connection');
      expect(service.state()).toBe('error');
      expect(sessionStorage.getItem('kidraw_agent_session_v1')).toBeNull();
      jasmine.clock().tick(120_000);
      expect(FakeSocket.instances.length).toBe(1);
      expect(service.messages().some(m => /another tab/i.test(m.text))).toBeTrue();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('explains a first connection that never reached the server', () => {
    const service = createService();
    service.openPanel();
    service.answerConsent('session');
    FakeSocket.latest().drop(1006);
    expect(service.state()).toBe('error');
    const errors = service.messages().filter(m => m.role === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].text).toContain("Couldn't reach");
    expect(errors[0].text).toContain(ENDPOINT.url);
  });

  it('says so when a reload tried to resume a session the server no longer has', async () => {
    sessionStorage.setItem('kidraw_agent_session_v1', JSON.stringify({
      url: ENDPOINT.url, graphKey: graph.key, sessionId: 'old', secret: 'gone', panelOpen: true,
    }));
    const service = createService();
    const socket = FakeSocket.latest();
    expect(socket).toBeDefined();
    socket.open();
    expect(socket.sent[0]['resume']).toEqual({sessionId: 'old', secret: 'gone'});
    socket.receive(READY);
    expect(service.panelOpen()).toBeTrue();
    expect(service.messages().some(m => /earlier conversation/i.test(m.text))).toBeTrue();
  });

  it('pauses tool calls after the user opens a graph they have not shared', async () => {
    const service = createService();
    const socket = connect(service);
    graph = {key: 'vault:private.kidraw.yaml', title: 'private.kidraw.yaml', stable: true};

    socket.receive({type: 'tool_call', callId: 'c1', name: 'get_outline', args: {}});
    await settle();
    const refused = socket.sent.find(m => m['type'] === 'tool_result' && m['callId'] === 'c1')!;
    expect(refused['ok']).toBeFalse();
    expect(refused['error']).toMatch(/not shared/i);
    expect(canvas.agentNodes).not.toHaveBeenCalled();
    expect(service.graphChange()?.title).toBe('private.kidraw.yaml');

    service.answerGraphChange('session');
    expect(service.graphChange()).toBeNull();
    socket.receive({type: 'tool_call', callId: 'c2', name: 'get_outline', args: {}});
    await settle();
    expect(socket.sent.find(m => m['callId'] === 'c2')!['ok']).toBeTrue();
  });

  it('pauses and clears the agent\'s marks as soon as another graph is loaded', async () => {
    const service = createService();
    const socket = connect(service);
    socket.receive({type: 'tool_call', callId: 'h1', name: 'highlight', args: {nodes: ['Start']}});
    await settle();
    socket.receive({type: 'tool_call', callId: 'c1', name: 'caption', args: {node: 'Start', text: 'here'}});
    await settle();
    expect(service.captions().length).toBe(1);

    graph = {key: 'local:Untitled#2', title: 'Untitled', stable: false};
    service.graphMayHaveChanged();
    expect(service.graphChange()?.key).toBe('local:Untitled#2');
    expect(service.captions().length).toBe(0);
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith([]);
  });

  it('sends the detail level with every prompt', () => {
    const service = createService();
    const socket = connect(service);
    service.setDetailLevel('thorough');
    try {
      expect(service.sendPrompt('explain primes')).toBeTrue();
      expect(socket.sent[socket.sent.length - 1])
        .toEqual(jasmine.objectContaining({type: 'prompt', text: 'explain primes', detail: 'thorough'}));
    } finally {
      service.setDetailLevel('standard');
    }
  });

  it('gives up on a connection that never opens', () => {
    jasmine.clock().install();
    try {
      const service = createService();
      service.openPanel();
      service.answerConsent('session');
      jasmine.clock().tick(16_000);
      expect(service.state()).toBe('error');
      expect(service.messages().some(m => /Timed out/.test(m.text))).toBeTrue();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('focus moves the view without touching the selection, and waits while the user is editing', async () => {
    const service = createService();
    const socket = connect(service);

    socket.receive({type: 'tool_call', callId: 'f1', name: 'focus', args: {node: 'Start'}});
    await settle();
    expect(canvas.agentFocusNode).toHaveBeenCalledWith('n1');
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith(['n1']);
    expect(service.lookHere()).toBeNull();

    canvas.agentFocusNode.calls.reset();
    editing = true;
    socket.receive({type: 'tool_call', callId: 'f2', name: 'focus', args: {node: 'End'}});
    await settle();
    expect(canvas.agentFocusNode).not.toHaveBeenCalled();
    expect(service.lookHere()?.id).toBe('n2');
    expect(socket.sent.find(m => m['callId'] === 'f2')!['result']['viewMoved']).toBeFalse();
  });

  it('groups a turn\'s edits into one change set, and refuses edits after Stop until the next prompt', async () => {
    const service = createService();
    const socket = connect(service);
    const edit = (callId: string) => socket.receive({
      type: 'tool_call', callId, name: 'apply_changes', args: {changes: [{kind: 'add_node', text: 'A step'}]},
    });

    expect(service.sendPrompt('explain it')).toBeTrue();
    edit('a1');
    await settle();
    edit('a2');
    await settle();
    const metas = canvas.agentApplyChanges.calls.allArgs().map(([, meta]) => meta);
    expect(metas.length).toBe(2);
    expect(metas[0]).toEqual(jasmine.objectContaining({author: 'agent:codex', label: 'Agent: explain it'}));
    expect(metas[1].changeSetId).toBe(metas[0].changeSetId);
    expect(service.agentEditTurn()).toBe(metas[0].changeSetId);

    service.cancel();
    edit('a3');
    await settle();
    const refused = socket.sent.find(m => m['callId'] === 'a3')!;
    expect(refused['ok']).toBeFalse();
    expect(refused['error']).toMatch(/stopped you/);
    expect(canvas.agentApplyChanges).toHaveBeenCalledTimes(2);

    socket.receive({type: 'turn_end', stopReason: 'cancelled'});
    expect(service.sendPrompt('carry on')).toBeTrue();
    edit('a4');
    await settle();
    expect(canvas.agentApplyChanges).toHaveBeenCalledTimes(3);
    expect(canvas.agentApplyChanges.calls.mostRecent().args[1].changeSetId).not.toBe(metas[0].changeSetId);
  });

  it('undoes the agent\'s last editing turn as a change set', async () => {
    const service = createService();
    const socket = connect(service);
    service.sendPrompt('explain it');
    socket.receive({type: 'tool_call', callId: 'a1', name: 'apply_changes', args: {changes: [{kind: 'add_node', text: 'x'}]}});
    await settle();
    const turn = service.agentEditTurn();
    expect(turn).not.toBeNull();

    await service.revertLastTurn();
    expect(canvas.agentRevertChangeSet).toHaveBeenCalledWith(turn!);
    expect(service.agentEditTurn()).toBeNull();
  });

  it('asking with nothing selected or under the crosshairs does not open the chat', () => {
    canvas.agentSelection.and.returnValue({nodeIds: [], edgeIds: [], underCrosshairsId: null});
    const service = createService();
    expect(service.askAboutSelection()).toBeFalse();
    expect(service.panelOpen()).toBeFalse();
  });
});
