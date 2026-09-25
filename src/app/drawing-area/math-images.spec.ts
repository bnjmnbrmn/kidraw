import {isMathReady, loadMath, mathImage, mathMetrics} from './math-images';

describe('math images', () => {
  // MathJax is a large lazy chunk; on a slow host it takes more than Jasmine's 5 s default to load.
  beforeAll(() => loadMath(), 60000);

  it('is ready once MathJax has loaded', () => {
    expect(isMathReady()).toBeTrue();
  });

  it('measures formulas in pixels at the font size', () => {
    const small = mathMetrics('x^2', 10)!;
    const large = mathMetrics('x^2', 20)!;
    expect(small.error).toBeFalse();
    expect(large.width).toBeCloseTo(small.width * 2, 5);
    expect(small.ascent).toBeGreaterThan(small.descent);
  });

  it('makes one colored, oversampled image per formula, size and color', () => {
    const image = mathImage('x^2', 16, '#123456')!;
    expect(mathImage('x^2', 16, '#123456')).toBe(image);
    expect(mathImage('x^2', 16, '#654321')).not.toBe(image);

    const svg = decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1));
    expect(svg).toContain('style="color: #123456"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`width="${mathMetrics('x^2', 16)!.width * 4}"`);
  });

  it('has nothing to draw for TeX that does not parse', () => {
    expect(mathMetrics('\\frac{a', 16)!.error).toBeTrue();
    expect(mathImage('\\frac{a', 16, '#000000')).toBeNull();
  });
});
