import {hasInlineMarkdown, InlineStyle, layoutSpans, parseInlineMarkdown} from './markdown-label';

const rendered = (text: string) =>
  parseInlineMarkdown(text).spans.map(s => `${s.bold ? 'B' : ''}${s.italic ? 'I' : ''}${s.code ? 'C' : ''}[${s.text}]`).join('');

const roles = (text: string) =>
  parseInlineMarkdown(text).source.map(s => `${s.role}:${text.slice(s.start, s.end)}`);

describe('markdown labels', () => {
  describe('parsing', () => {
    it('leaves plain text alone', () => {
      expect(hasInlineMarkdown('Socrates is a man')).toBeFalse();
      expect(rendered('Socrates is a man')).toBe('[Socrates is a man]');
    });

    it('renders bold, italic and code without their markers', () => {
      expect(rendered('a **b** c')).toBe('[a ]B[b][ c]');
      expect(rendered('a *b* _c_')).toBe('[a ]I[b][ ]I[c]');
      expect(rendered('call `f(x)` now')).toBe('[call ]C[f(x)][ now]');
      expect(rendered('**bold *both* bold**')).toBe('B[bold ]BI[both]B[ bold]');
    });

    it('keeps unclosed or spaced markers literal', () => {
      expect(rendered('2 * 3 * 4')).toBe('[2 * 3 * 4]');
      expect(rendered('**not closed')).toBe('[**not closed]');
      expect(rendered('a ` b')).toBe('[a ` b]');
      expect(rendered('snake_case_name')).toBe('[snake_case_name]');
    });

    it('does not read markers inside code', () => {
      expect(rendered('`a*b*c`')).toBe('C[a*b*c]');
    });

    it('honours backslash escapes', () => {
      expect(rendered('\\*not italic\\*')).toBe('[*not italic*]');
    });

    it('classifies every source character for the editing view', () => {
      expect(roles('a **b** `c`')).toEqual(['text:a ', 'marker:**', 'text:b', 'marker:**', 'text: ', 'marker:`', 'code:c', 'marker:`']);
      const text = 'x \\* y';
      const covered = parseInlineMarkdown(text).source.reduce((n, s) => n + s.end - s.start, 0);
      expect(covered).toBe(text.length);
    });
  });

  describe('layout', () => {
    // Every character is 10 wide, bold ones 12, so widths are easy to check.
    const measure = (text: string, style: InlineStyle) => text.length * (style.bold ? 12 : 10);

    it('wraps at spaces and centres by width without trailing spaces', () => {
      const lines = layoutSpans(parseInlineMarkdown('aaa bbb ccc').spans, 75, measure);
      expect(lines.map(l => l.runs.map(r => r.text).join(''))).toEqual(['aaa bbb', 'ccc']);
      expect(lines[0].width).toBe(70);
    });

    it('positions styled runs along the line', () => {
      const [line] = layoutSpans(parseInlineMarkdown('a **bb** c').spans, 500, measure);
      expect(line.runs.map(r => [r.text, r.x, r.width])).toEqual([['a ', 0, 20], ['bb', 20, 24], [' c', 44, 20]]);
    });

    it('keeps explicit newlines and breaks words longer than a line', () => {
      const lines = layoutSpans(parseInlineMarkdown('ab\nabcdefgh').spans, 50, measure);
      expect(lines.map(l => l.runs.map(r => r.text).join(''))).toEqual(['ab', 'abcde', 'fgh']);
    });

    it('moves a word split by a style change as one word', () => {
      const lines = layoutSpans(parseInlineMarkdown('aaaa b**cc**').spans, 60, measure);
      expect(lines.map(l => l.runs.map(r => r.text).join(''))).toEqual(['aaaa', 'bcc']);
    });

    it('does not wrap when wrapping is off', () => {
      expect(layoutSpans(parseInlineMarkdown('aaa bbb ccc').spans, 20, measure, false).length).toBe(1);
    });
  });
});
