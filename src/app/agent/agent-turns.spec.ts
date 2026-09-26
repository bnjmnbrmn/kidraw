import {signal} from '@angular/core';
import {AgentTurns} from './agent-turns';

describe('AgentTurns', () => {
  it('files each prompt\'s edits under one change set named after the prompt', () => {
    const last = signal<string | null>(null);
    const turns = new AgentTurns(last);
    turns.begin('explain recursion with a small example please, step by step');
    const meta = turns.editMeta('codex');
    expect(meta.author).toBe('agent:codex');
    expect(meta.label).toBe('Agent: explain recursion with a small example …');
    expect(turns.editMeta('codex').changeSetId).toBe(meta.changeSetId);
    turns.begin('again');
    expect(turns.editMeta('codex').changeSetId).not.toBe(meta.changeSetId);
  });

  it('refuses edits after Stop, until the next prompt', () => {
    const turns = new AgentTurns(signal<string | null>(null));
    turns.begin('go');
    turns.stop();
    expect(turns.editsRefused()).toContain('stopped');
    turns.begin('go on');
    expect(turns.editsRefused()).toBeNull();
  });

  it('after reverting the last edited turn, the one before it is last', () => {
    const last = signal<string | null>(null);
    const turns = new AgentTurns(last);
    turns.recordEdit('t1');
    turns.recordEdit('t2');
    expect(last()).toBe('t2');
    turns.forget('t2');
    expect(last()).toBe('t1');
    turns.forget('t1');
    expect(last()).toBeNull();
  });
});
