import Konva from 'konva';
import {
  clampIndex,
  lineIndexAt,
  lineRangesFromWrapped,
  innerWordRange,
  logicalLineEnd,
  logicalLineStart,
  moveVertical,
  wordBack,
  wordEnd,
  wordForward,
  vimChangeRange,
} from './text-cursor';

describe('text-cursor', () => {
  describe('innerWordRange', () => {
    it('selects the word containing the cursor', () => {
      expect(innerWordRange('alpha beta gamma', 8)).toEqual({start: 6, end: 10});
    });

    it('chooses the next word from whitespace and the previous word at EOF', () => {
      expect(innerWordRange('alpha  beta', 5)).toEqual({start: 7, end: 11});
      expect(innerWordRange('alpha  ', 7)).toEqual({start: 0, end: 5});
      expect(innerWordRange('   ', 1)).toBeNull();
    });
  });

  describe('wordForward', () => {
    it('jumps to the start of the next word', () => {
      //         0123456789
      const t = 'foo bar baz';
      expect(wordForward(t, 0)).toBe(4);
      expect(wordForward(t, 4)).toBe(8);
    });

    it('stops at end of text from the last word', () => {
      const t = 'foo bar';
      expect(wordForward(t, 4)).toBe(7);
      expect(wordForward(t, 7)).toBe(7);
    });

    it('skips runs of whitespace and newlines', () => {
      const t = 'foo \n bar';
      expect(wordForward(t, 0)).toBe(6);
    });
  });

  describe('wordBack', () => {
    it('moves to the start of the current word when mid-word', () => {
      const t = 'foo bar';
      expect(wordBack(t, 6)).toBe(4);
    });

    it('moves to the previous word start from a word start', () => {
      const t = 'foo bar';
      expect(wordBack(t, 4)).toBe(0);
      expect(wordBack(t, 0)).toBe(0);
    });

    it('crosses newlines', () => {
      const t = 'foo\nbar';
      expect(wordBack(t, 4)).toBe(0);
    });
  });

  describe('wordEnd', () => {
    it('moves to the end of the current word', () => {
      const t = 'foo bar baz';
      expect(wordEnd(t, 0)).toBe(2);
      expect(wordEnd(t, 4)).toBe(6);
    });

    it('moves to the next word end from whitespace or a word end', () => {
      const t = 'foo  bar';
      expect(wordEnd(t, 2)).toBe(7);
      expect(wordEnd(t, 3)).toBe(7);
      expect(wordEnd(t, 7)).toBe(7);
    });

    it('stays at zero for empty text', () => {
      expect(wordEnd('', 0)).toBe(0);
    });
  });

  describe('logical line start/end', () => {
    const t = 'ab\ncde\n\nf';
    it('finds the line start', () => {
      expect(logicalLineStart(t, 0)).toBe(0);
      expect(logicalLineStart(t, 2)).toBe(0);
      expect(logicalLineStart(t, 4)).toBe(3);
      expect(logicalLineStart(t, 7)).toBe(7); // the empty line
      expect(logicalLineStart(t, 9)).toBe(8);
    });
    it('finds the line end', () => {
      expect(logicalLineEnd(t, 0)).toBe(2);
      expect(logicalLineEnd(t, 4)).toBe(6);
      expect(logicalLineEnd(t, 7)).toBe(7);
      expect(logicalLineEnd(t, 8)).toBe(9);
    });
  });

  describe('vimChangeRange', () => {
    const text = 'alpha beta\ngamma';

    it('implements word changes without consuming the trailing gap', () => {
      expect(vimChangeRange(text, 0, 'word-forward')).toEqual({start: 0, end: 5});
      expect(vimChangeRange(text, 0, 'word-end')).toEqual({start: 0, end: 5});
      expect(vimChangeRange(text, 6, 'word-back')).toEqual({start: 0, end: 6});
      expect(vimChangeRange('word', 4, 'word-forward')).toEqual({start: 3, end: 4});
    });

    it('implements character and line changes', () => {
      expect(vimChangeRange(text, 2, 'char-left')).toEqual({start: 1, end: 2});
      expect(vimChangeRange(text, 2, 'char-right')).toEqual({start: 2, end: 3});
      expect(vimChangeRange(text, 8, 'line-start')).toEqual({start: 0, end: 8});
      expect(vimChangeRange(text, 8, 'line-end')).toEqual({start: 8, end: 10});
      expect(vimChangeRange(text, 13, 'line')).toEqual({start: 11, end: 16});
    });
  });

  describe('clampIndex', () => {
    it('clamps into [0, length]', () => {
      expect(clampIndex('abc', -1)).toBe(0);
      expect(clampIndex('abc', 5)).toBe(3);
      expect(clampIndex('abc', 2)).toBe(2);
    });
  });

  describe('lineRangesFromWrapped (against real Konva wrapping)', () => {
    /** Wrap `text` with Konva exactly the way DANode's label renders it. */
    function konvaWrap(text: string, width: number) {
      const t = new Konva.Text({text, width, fontSize: 16, wrap: 'word'});
      return (t as unknown as {textArr: {text: string; lastInParagraph: boolean}[]}).textArr;
    }

    it('maps explicit newlines', () => {
      const text = 'ab\ncd';
      const ranges = lineRangesFromWrapped(text, konvaWrap(text, 200));
      expect(ranges).toEqual([{start: 0, length: 2}, {start: 3, length: 2}]);
    });

    it('maps empty lines from double newlines', () => {
      const text = 'ab\n\ncd';
      const ranges = lineRangesFromWrapped(text, konvaWrap(text, 200));
      expect(ranges).toEqual([
        {start: 0, length: 2}, {start: 3, length: 0}, {start: 4, length: 2},
      ]);
    });

    it('maps word-wrapped lines back to raw indices', () => {
      const text = 'alpha beta gamma delta';
      const wrapped = konvaWrap(text, 60); // forces wrapping
      const ranges = lineRangesFromWrapped(text, wrapped);
      expect(wrapped.length).toBeGreaterThan(1);
      // Every range's slice must reproduce the rendered line text.
      wrapped.forEach((line, k) => {
        expect(text.substr(ranges[k].start, ranges[k].length)).toBe(line.text);
      });
    });

    it('handles empty text', () => {
      expect(lineRangesFromWrapped('', konvaWrap('', 200)))
        .toEqual([{start: 0, length: 0}]);
    });
  });

  describe('moveVertical', () => {
    // 'abcde' / 'fg' / 'hijk' as display lines with 1-char separators.
    const ranges = [
      {start: 0, length: 5}, {start: 6, length: 2}, {start: 9, length: 4},
    ];

    it('keeps the column when the target line is long enough', () => {
      expect(moveVertical(ranges, 1, 1)).toBe(7);   // col 1 → col 1
      expect(moveVertical(ranges, 10, -1)).toBe(7); // col 1 → col 1
    });

    it('clamps the column to a shorter target line', () => {
      expect(moveVertical(ranges, 4, 1)).toBe(8);   // col 4 → line len 2
    });

    it('no-ops past the first and last lines', () => {
      expect(moveVertical(ranges, 2, -1)).toBe(2);
      expect(moveVertical(ranges, 11, 1)).toBe(11);
    });

    it('line boundaries belong to the earlier line', () => {
      expect(lineIndexAt(ranges, 5)).toBe(0);
      expect(lineIndexAt(ranges, 6)).toBe(1);
    });
  });
});
