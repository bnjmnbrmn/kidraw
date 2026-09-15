import {renderTex} from './math-renderer';

describe('math renderer', () => {
  it('renders TeX to an SVG sized in ems about the baseline', () => {
    const fraction = renderTex('\\frac{a+b}{\\sqrt{c}}');
    expect(fraction.error).toBeFalse();
    expect(fraction.svg).toContain('<svg');
    expect(fraction.width).toBeGreaterThan(1);
    expect(fraction.ascent).toBeGreaterThan(0.5);
    expect(fraction.descent).toBeGreaterThan(0.3);

    const square = renderTex('x^2');
    expect(square.descent).toBeLessThan(0.1);
  });

  it('keeps an inline formula in one piece', () => {
    const product = renderTex('p_1 \\times p_2 \\times \\cdots \\times p_k');
    expect((product.svg.match(/<svg/g) ?? []).length).toBe(1);
    expect(product.width).toBeGreaterThan(5);
  });

  it('reports TeX that does not parse', () => {
    expect(renderTex('\\frac{a').error).toBeTrue();
    expect(renderTex('\\notacommand').error).toBeTrue();
  });
});
