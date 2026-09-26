import {signal} from '@angular/core';
import type {ChatMessage} from './agent-store';
import {ChatTranscript} from './chat-transcript';

describe('ChatTranscript', () => {
  const setUp = () => {
    const messages = signal<ChatMessage[]>([]);
    return {messages, transcript: new ChatTranscript(messages)};
  };
  const texts = (messages: () => ChatMessage[]) => messages().map(m => `${m.role}:${m.text}`);

  it('streams a reply into one message until it ends', () => {
    const {messages, transcript} = setUp();
    transcript.appendAgentText('Hel');
    transcript.appendAgentText('lo');
    transcript.endStreaming();
    transcript.appendAgentText('Again');
    expect(texts(messages)).toEqual(['agent:Hello', 'agent:Again']);
  });

  it('updates an activity line when its status changes', () => {
    const {messages, transcript} = setUp();
    transcript.recordActivity('Reading the graph', 'in_progress');
    transcript.recordActivity('Reading the graph', 'failed');
    expect(texts(messages)).toEqual(['activity:Reading the graph (failed)']);
  });

  it('does not repeat the same error twice in a row', () => {
    const {messages, transcript} = setUp();
    transcript.addErrorOnce('No server');
    transcript.addErrorOnce('No server');
    expect(messages().length).toBe(1);
  });

  it('replaces the conversation with a resumed session\'s, its last reply still streaming if busy', () => {
    const {messages, transcript} = setUp();
    transcript.add({role: 'user', text: 'old'});
    transcript.replaceWith([{role: 'user', text: 'hi'}, {role: 'agent', text: 'hel'}], true);
    expect(texts(messages)).toEqual(['user:hi', 'agent:hel']);
    expect(messages()[1].streaming).toBeTrue();
  });
});
