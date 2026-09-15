import {DACommand, DACommandType} from '../drawing-area/command.model';
import {ChatDraft} from './chat-draft';

describe('ChatDraft', () => {
  let draft: ChatDraft;
  const run = (...commands: DACommand[]) => commands.forEach(command => expect(draft.apply(command)).toBeTrue());
  const at = () => draft.state().cursor;

  beforeEach(() => {
    draft = new ChatDraft();
  });

  it('types, backspaces and moves by words and lines like a label', () => {
    draft.set('hello');
    run({kind: DACommandType.INSERT_CHAR, value: ' world'});
    expect(draft.text()).toBe('hello world');
    run({kind: DACommandType.DELETE_LAST_CHAR});
    expect(draft.text()).toBe('hello worl');
    run({kind: DACommandType.CURSOR_LINE_START});
    expect(at()).toBe(0);
    run({kind: DACommandType.CURSOR_WORD_FORWARD});
    expect(at()).toBe(6);
    run({kind: DACommandType.CURSOR_LINE_END});
    expect(at()).toBe(10);
  });

  it('changes and deletes with vim ranges in normal mode', () => {
    draft.set('one two three');
    run(
      {kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'vimNormal'},
      {kind: DACommandType.CURSOR_LINE_START},
      {kind: DACommandType.CURSOR_WORD_FORWARD},
      {kind: DACommandType.CHANGE_TEXT_AT_CURSOR, motion: 'word-forward'},
    );
    expect(draft.text()).toBe('one  three');
    expect(at()).toBe(4);
    run({kind: DACommandType.DELETE_CHAR_AT_CURSOR});
    expect(draft.text()).toBe('one three');
  });

  it('replaces and changes a visual selection', () => {
    draft.set('abc def');
    run(
      {kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'vimNormal'},
      {kind: DACommandType.CURSOR_LINE_START},
      {kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'vimVisual'},
      {kind: DACommandType.CURSOR_RIGHT},
      {kind: DACommandType.CURSOR_RIGHT},
    );
    expect(draft.selection()).toEqual({start: 0, end: 3});
    run({kind: DACommandType.REPLACE_CHAR_AT_CURSOR, value: 'x'});
    expect(draft.text()).toBe('xxx def');

    run({kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'vimNormal'});
    expect(draft.selection()).toBeNull();
    run({kind: DACommandType.SELECT_INNER_WORD});
    expect(draft.selection()).toEqual({start: 0, end: 3});
    run({kind: DACommandType.CHANGE_TEXT_AT_CURSOR, motion: 'selection'});
    expect(draft.text()).toBe(' def');
    expect(at()).toBe(0);
  });

  it('moves between lines, keeping the column where it can', () => {
    draft.set('abcd\nxy');
    run({kind: DACommandType.CURSOR_UP});
    expect(at()).toBe(2);
    run({kind: DACommandType.CURSOR_DOWN});
    expect(at()).toBe(7);
    run({kind: DACommandType.CURSOR_DOWN});
    expect(at()).toBe(7);
  });

  it('clears after sending without leaving visual mode behind, and ignores other commands', () => {
    draft.set('sent');
    run({kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'vimVisual'});
    draft.clear();
    expect(draft.state()).toEqual({text: '', cursor: 0, mode: 'vimNormal', anchor: null});
    expect(draft.apply({kind: DACommandType.UNSELECT_ALL} as DACommand)).toBeFalse();
  });
});
