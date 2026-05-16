import {
  findManifest,
  isKidrawFile,
  isStyleFile,
  packZip,
  unpackZip,
} from './zip-bundle';

describe('zip-bundle', () => {
  it('round-trips a single text file through pack/unpack', () => {
    const packed = packZip([{ name: 'graph.kidraw.yaml', content: 'kidraw: 1\n' }]);
    expect(packed.length).toBeGreaterThan(0);
    const unpacked = unpackZip(packed);
    expect(unpacked.length).toBe(1);
    expect(unpacked[0].name).toBe('graph.kidraw.yaml');
    expect(unpacked[0].content).toBe('kidraw: 1\n');
  });

  it('round-trips multiple files preserving directory layout', () => {
    const files = [
      { name: 'auth.kidraw.json', content: '{"kidraw":1}' },
      { name: 'styles/overview.kd-style.json', content: '{"kdStyle":1}' },
      { name: 'styles/theme-dark.kd-style.yaml', content: 'kdStyle: 1\n' },
    ];
    const unpacked = unpackZip(packZip(files));
    const byName = new Map(unpacked.map(f => [f.name, f.content]));
    for (const f of files) {
      expect(byName.get(f.name)).toBe(f.content);
    }
  });

  it('preserves UTF-8 content (non-ASCII characters round-trip)', () => {
    const content = 'kidraw: 1\nsemantics:\n  nodes:\n    n1: { label: "café — ★" }\n';
    const unpacked = unpackZip(packZip([{ name: 'g.kidraw.yaml', content }]));
    expect(unpacked[0].content).toBe(content);
  });

  it('findManifest picks the .kidraw.* file', () => {
    const files = [
      { name: 'theme.kd-style.yaml', content: '' },
      { name: 'graph.kidraw.yaml', content: 'kidraw: 1\n' },
      { name: 'README.md', content: '' },
    ];
    const m = findManifest(files);
    expect(m?.name).toBe('graph.kidraw.yaml');
  });

  it('findManifest returns null when no kidraw file is present', () => {
    expect(findManifest([{ name: 'foo.txt', content: '' }])).toBeNull();
  });

  it('findManifest picks first alphabetically when there are multiple', () => {
    const m = findManifest([
      { name: 'z.kidraw.yaml', content: '' },
      { name: 'a.kidraw.json', content: '' },
    ]);
    expect(m?.name).toBe('a.kidraw.json');
  });

  it('isKidrawFile / isStyleFile classifications', () => {
    expect(isKidrawFile('foo.kidraw.json')).toBe(true);
    expect(isKidrawFile('foo.kidraw.yaml')).toBe(true);
    expect(isKidrawFile('foo.kd-style.yaml')).toBe(false);
    expect(isStyleFile('foo.kd-style.yaml')).toBe(true);
    expect(isStyleFile('foo.kidraw.json')).toBe(false);
  });
});
