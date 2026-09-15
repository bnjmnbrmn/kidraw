/**
 * TeX to standalone SVG with MathJax 4, for math in node labels. Loaded lazily
 * (see math-images.ts), since MathJax and its font data are large and most
 * graphs never use math.
 *
 * The TeX font's glyphs are embedded as paths, so the SVG needs no web fonts:
 * drawn as an image it looks the same on the canvas and in exports.
 */
import {mathjax} from '@mathjax/src/js/mathjax.js';
import {TeX} from '@mathjax/src/js/input/tex.js';
import {SVG} from '@mathjax/src/js/output/svg.js';
import {liteAdaptor} from '@mathjax/src/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import {MathJaxTexFont} from '@mathjax/mathjax-tex-font/js/svg.js';

/** A formula, sized in ems: multiply by the font size for pixels. */
export interface RenderedTex {
  svg: string;
  width: number;
  /** Above and below the text baseline. */
  ascent: number;
  descent: number;
  /** The TeX didn't parse; `svg` is empty and callers show the source instead. */
  error: boolean;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', {
  InputJax: new TeX({packages: ['base', 'ams', 'newcommand']}),
  // One unbroken SVG per formula: labels wrap around formulas, not inside them.
  OutputJax: new SVG({fontData: MathJaxTexFont, fontCache: 'none', linebreaks: {inline: false}}),
});

const FAILED: RenderedTex = {svg: '', width: 0, ascent: 0, descent: 0, error: true};

export function renderTex(tex: string): RenderedTex {
  let svg: string;
  try {
    svg = adaptor.innerHTML(document.convert(tex, {display: false}));
  } catch {
    return FAILED;
  }
  if (svg.includes('data-mjx-error')) return FAILED;
  // The viewBox is in thousandths of an em, with y = 0 on the baseline.
  const viewBox = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
  if (!viewBox) return FAILED;
  const top = Number(viewBox[2]);
  const width = Number(viewBox[3]);
  const height = Number(viewBox[4]);
  return {svg, width: width / 1000, ascent: -top / 1000, descent: (height + top) / 1000, error: false};
}
