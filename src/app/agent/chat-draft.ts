import {signal} from '@angular/core';
import {DACommand, DACommandType, TextCursorMode} from '../drawing-area/command.model';
import {
  clampIndex, innerWordRange, LineRange, logicalLineEnd, logicalLineStart, moveVertical, vimChangeRange,
  wordBack, wordEnd, wordForward,
} from '../drawing-area/text-cursor';

export interface DraftState {
  text: string;
  /** Insertion index, 0..text.length (a block cursor sits on the character after it). */
  cursor: number;
  mode: TextCursorMode;
  /** Where a vim visual selection started; null outside visual mode. */
  anchor: number | null;
}

const EMPTY: DraftState = {text: '', cursor: 0, mode: 'insert', anchor: null};

/**
 * The message being written in the agent chat. It is edited with the same
 * commands the keymenu sends a node label in label editing (insert, vim
 * normal and visual modes), so the chat types like a node. The editing
 * semantics mirror DANode's, over plain text whose lines are its own `\n`
 * lines.
 */
export class ChatDraft {
  readonly state = signal<DraftState>(EMPTY);

  text(): string {
    return this.state().text;
  }

  /** Replace the text, with the caret at the end, ready to type. */
  set(text: string): void {
    this.state.set({text, cursor: text.length, mode: 'insert', anchor: null});
  }

  /** Empty the draft (after sending), keeping the editing mode. */
  clear(): void {
    this.state.update(s => ({...EMPTY, mode: s.mode === 'vimVisual' ? 'vimNormal' : s.mode}));
  }

  /** The visual selection, end exclusive, or null outside visual mode. */
  selection(): {start: number; end: number} | null {
    const {text, cursor, mode, anchor} = this.state();
    if (mode !== 'vimVisual' || anchor === null || text.length === 0) return null;
    const at = Math.min(cursor, text.length - 1);
    return {start: Math.min(anchor, at), end: Math.max(anchor, at) + 1};
  }

  /** Apply one label-editing command. False for any other command, which the caller routes elsewhere. */
  apply(command: DACommand): boolean {
    const s = this.state();
    const text = s.text;
    const cursor = clampIndex(text, s.cursor);
    const put = (next: Partial<DraftState>) => this.state.set({...s, cursor, ...next});
    const move = (to: number) => put({cursor: clampIndex(text, to)});
    const remove = (start: number, end: number) => {
      const rest = text.slice(0, start) + text.slice(end);
      put({text: rest, cursor: Math.min(start, Math.max(rest.length - 1, 0))});
    };

    switch (command.kind) {
      case DACommandType.INSERT_CHAR:
        put({text: text.slice(0, cursor) + command.value + text.slice(cursor), cursor: cursor + command.value.length});
        return true;
      case DACommandType.DELETE_LAST_CHAR:
        if (cursor > 0) put({text: text.slice(0, cursor - 1) + text.slice(cursor), cursor: cursor - 1});
        return true;
      case DACommandType.DELETE_CHAR_AT_CURSOR: {
        // Vim `x`: the selection, or the character under the block cursor.
        const selection = this.selection();
        if (selection) remove(selection.start, selection.end);
        else if (text.length > 0) remove(Math.min(cursor, text.length - 1), Math.min(cursor, text.length - 1) + 1);
        return true;
      }
      case DACommandType.REPLACE_CHAR_AT_CURSOR: {
        if (text.length === 0 || command.value.length === 0) return true;
        const ch = command.value[0];
        const selection = this.selection();
        if (selection) {
          const replaced = text.slice(selection.start, selection.end).replace(/[^\n]/g, ch);
          put({text: text.slice(0, selection.start) + replaced + text.slice(selection.end), cursor: selection.start});
        } else {
          const i = Math.min(cursor, text.length - 1);
          put({text: text.slice(0, i) + ch + text.slice(i + 1), cursor: i});
        }
        return true;
      }
      case DACommandType.CHANGE_TEXT_AT_CURSOR: {
        // Vim `c`/`d` with a motion: remove the range and leave the caret at its start.
        const range = command.motion === 'selection' ? this.selection() : vimChangeRange(text, cursor, command.motion);
        if (range) put({text: text.slice(0, range.start) + text.slice(range.end), cursor: range.start});
        return true;
      }
      case DACommandType.CURSOR_LEFT:
        move(cursor - 1);
        return true;
      case DACommandType.CURSOR_RIGHT:
        move(cursor + 1);
        return true;
      case DACommandType.CURSOR_UP:
        move(moveVertical(lineRanges(text), cursor, -1));
        return true;
      case DACommandType.CURSOR_DOWN:
        move(moveVertical(lineRanges(text), cursor, 1));
        return true;
      case DACommandType.CURSOR_LINE_START:
        move(logicalLineStart(text, cursor));
        return true;
      case DACommandType.CURSOR_LINE_END:
        move(logicalLineEnd(text, cursor));
        return true;
      case DACommandType.CURSOR_WORD_FORWARD:
        move(wordForward(text, cursor));
        return true;
      case DACommandType.CURSOR_WORD_END:
        move(wordEnd(text, cursor));
        return true;
      case DACommandType.CURSOR_WORD_BACK:
        move(wordBack(text, cursor));
        return true;
      case DACommandType.SELECT_INNER_WORD: {
        const range = innerWordRange(text, cursor);
        if (range) put({mode: 'vimVisual', anchor: range.start, cursor: range.end - 1});
        return true;
      }
      case DACommandType.SET_TEXT_CURSOR_MODE: {
        // Entering visual mode anchors the selection on the character under the cursor.
        const anchor = command.mode !== 'vimVisual' ? null
          : s.mode === 'vimVisual' ? s.anchor
          : text.length === 0 ? null : Math.min(cursor, text.length - 1);
        put({mode: command.mode, anchor});
        return true;
      }
      default:
        return false;
    }
  }
}

/** The text's own lines, for moving the caret up and down. */
function lineRanges(text: string): LineRange[] {
  const ranges: LineRange[] = [];
  let start = 0;
  for (const line of text.split('\n')) {
    ranges.push({start, length: line.length});
    start += line.length + 1;
  }
  return ranges;
}
