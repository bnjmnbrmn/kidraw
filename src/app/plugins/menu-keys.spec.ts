import {assignMenuKeys} from './menu-keys';

const RIGHT_HAND = ['h', 'j', 'k', 'l', ';', 'u', 'i', 'o'];
const keysOf = (result: {placed: {key: string; entry: {label: string}}[]}) =>
  result.placed.map(({key, entry}) => `${key} ${entry.label}`);

describe('assignMenuKeys', () => {
  it('fills the ergonomic keys in order, keeping the plugin\'s order', () => {
    const result = assignMenuKeys([{label: 'a'}, {label: 'b'}, {label: 'c'}], RIGHT_HAND);
    expect(keysOf(result)).toEqual(['h a', 'j b', 'k c']);
  });

  it('gives an entry the key it suggests when that key is ergonomic and free', () => {
    const result = assignMenuKeys([{label: 'Draft'}, {label: 'In Progress', key: 'i'}, {label: 'Done'}], RIGHT_HAND);
    expect(keysOf(result)).toEqual(['h Draft', 'i In Progress', 'j Done']);
  });

  it('never clashes: a taken key is not used, even if suggested', () => {
    const result = assignMenuKeys([{label: 'x', key: 'h'}, {label: 'y'}], RIGHT_HAND, new Set(['h', 'j']));
    expect(keysOf(result)).toEqual(['k x', 'l y']);
  });

  it('puts ergonomics before memory: a suggested key off the ergonomic list is not used', () => {
    const result = assignMenuKeys([{label: 'Done', key: 'd'}], RIGHT_HAND);
    expect(keysOf(result)).toEqual(['h Done']);
  });

  it('gives a key suggested twice to the first entry that asks', () => {
    const result = assignMenuKeys([{label: 'first', key: 'k'}, {label: 'second', key: 'k'}], RIGHT_HAND);
    expect(keysOf(result)).toEqual(['k first', 'h second']);
  });

  it('returns what it could not place when the keys run out', () => {
    const result = assignMenuKeys([{label: 'a'}, {label: 'b'}, {label: 'c'}], ['h', 'j']);
    expect(keysOf(result)).toEqual(['h a', 'j b']);
    expect(result.unplaced).toEqual([{label: 'c'}]);
  });
});
