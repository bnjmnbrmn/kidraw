import { KidrawPlugin } from './plugin.model';

/** TeX between `$…$` in markdown labels, typeset with MathJax (a lazy chunk,
 *  loaded the first time a label has math). Off, `$` is ordinary text. */
export const MATH_PLUGIN: KidrawPlugin = {
  id: 'math',
  name: 'Math',
  description: 'TeX between $…$ in markdown labels, typeset with MathJax',
  feature: true,
  requires: ['markdown'],
  nodeDefaults: {},
};
