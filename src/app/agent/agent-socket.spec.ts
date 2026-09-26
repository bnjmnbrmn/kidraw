import {afterClose, RECONNECT_DELAYS_MS, SessionSituation, SocketClosed} from './agent-socket';

describe('afterClose', () => {
  const endpoint = {name: 'home', url: 'wss://home.example/agent/'};
  const closed = (over: Partial<SocketClosed> = {}): SocketClosed =>
    ({code: 1006, reason: '', opened: true, timedOut: false, ...over});
  const up = (over: Partial<SessionSituation> = {}): SessionSituation =>
    ({wasReady: true, attempts: 0, canResume: true, endpoint, ...over});

  it('retries a dropped session that can resume', () => {
    expect(afterClose(closed(), up())).toEqual({kind: 'retry'});
  });

  it('gives up after the last retry', () => {
    expect(afterClose(closed(), up({wasReady: false, attempts: RECONNECT_DELAYS_MS.length})))
      .toEqual({kind: 'fail', message: "Couldn't reconnect to home."});
  });

  it('does not retry what the server refused, and passes its reason on', () => {
    expect(afterClose(closed({code: 4003, reason: 'Too many sessions'}), up()))
      .toEqual({kind: 'fail', message: 'Too many sessions'});
  });

  it('knows when another tab took the session over', () => {
    expect(afterClose(closed({code: 4001}), up())).toEqual({kind: 'taken-over'});
  });

  it('says which way a first connection failed', () => {
    const first = up({wasReady: false});
    expect(afterClose(closed({timedOut: true, opened: false}), first).kind).toBe('fail');
    expect((afterClose(closed({timedOut: true, opened: false}), first) as {message: string}).message).toContain('Timed out');
    expect((afterClose(closed({opened: false}), first) as {message: string}).message).toContain("Couldn't reach");
  });

  it('reports a plain disconnect when there is nothing to resume', () => {
    expect(afterClose(closed(), up({canResume: false}))).toEqual({kind: 'fail', message: 'Disconnected from the agent.'});
  });
});
