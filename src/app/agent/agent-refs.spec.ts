import {parseRefSegments} from './agent-refs';

describe('parseRefSegments', () => {
  it('returns plain text unchanged', () => {
    expect(parseRefSegments('no refs here')).toEqual([{kind: 'text', text: 'no refs here'}]);
  });

  it('splits text around labeled refs', () => {
    expect(parseRefSegments('See [[ref:n12|Pre-MVP]] and [[ref:n3|Use cases]].')).toEqual([
      {kind: 'text', text: 'See '},
      {kind: 'ref', id: 'n12', label: 'Pre-MVP'},
      {kind: 'text', text: ' and '},
      {kind: 'ref', id: 'n3', label: 'Use cases'},
      {kind: 'text', text: '.'},
    ]);
  });

  it('uses the id when a ref has no label', () => {
    expect(parseRefSegments('[[ref:da-7]]')).toEqual([{kind: 'ref', id: 'da-7', label: 'da-7'}]);
  });

  it('leaves malformed refs as text', () => {
    expect(parseRefSegments('[[ref: spaced|X]]')).toEqual([{kind: 'text', text: '[[ref: spaced|X]]'}]);
  });
});
