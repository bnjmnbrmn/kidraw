import { GraphSnapshot } from '../drawing-area/graph-snapshot';
import { DraftStorageService } from './draft-storage.service';

function makeSnapshot(): GraphSnapshot {
  return {
    nodes: [
      { id: 'a', x: 10, y: 20, text: 'Alpha', width: 120, height: 60, fontSize: 14, isSelected: false },
      { id: 'b', x: 200, y: 20, text: 'Beta', width: 120, height: 60, fontSize: 14, isSelected: false },
    ],
    edges: [
      { id: 'e1', srcNodeId: 'a', destNodeId: 'b', isSelected: false, labels: [], directedness: 'directed' },
    ],
  };
}

describe('DraftStorageService', () => {
  let service: DraftStorageService;

  beforeEach(() => {
    localStorage.removeItem(DraftStorageService.V1_KEY);
    localStorage.removeItem(DraftStorageService.V2_KEY);
    service = new DraftStorageService();
  });

  afterEach(() => {
    localStorage.removeItem(DraftStorageService.V1_KEY);
    localStorage.removeItem(DraftStorageService.V2_KEY);
  });

  it('returns null when no draft exists', () => {
    expect(service.load()).toBeNull();
  });

  it('round-trips a snapshot save/load through localStorage', () => {
    const snap = makeSnapshot();
    service.saveSnapshot(snap, { filePath: '/path/foo.kidraw.yaml', dirty: false });

    const draft = service.load();
    expect(draft).not.toBeNull();
    expect(draft!.version).toBe(2);
    expect(draft!.filePath).toBe('/path/foo.kidraw.yaml');
    expect(draft!.dirty).toBe(false);

    const restored = service.draftToSnapshot(draft!);
    expect(restored.nodes.length).toBe(2);
    expect(restored.edges.length).toBe(1);
    expect(restored.nodes.map(n => n.id).sort()).toEqual(['a', 'b']);
    expect(restored.edges[0].directedness).toBe('directed');
  });

  it('migrates a v1 payload on first load and clears the v1 key', () => {
    const v1: GraphSnapshot = makeSnapshot();
    localStorage.setItem(DraftStorageService.V1_KEY, JSON.stringify(v1));

    const draft = service.load();
    expect(draft).not.toBeNull();
    expect(draft!.version).toBe(2);
    expect(draft!.dirty).toBe(true);              // migration marks dirty
    expect(draft!.filePath).toBeNull();

    // v1 key was cleared
    expect(localStorage.getItem(DraftStorageService.V1_KEY)).toBeNull();
    // v2 key now exists
    expect(localStorage.getItem(DraftStorageService.V2_KEY)).not.toBeNull();

    // Reload — should read v2 directly this time
    const second = service.load();
    expect(second).not.toBeNull();
    expect(second!.savedAt).toBe(draft!.savedAt);

    const restored = service.draftToSnapshot(draft!);
    expect(restored.nodes.length).toBe(2);
  });

  it('returns null for corrupted JSON in the v2 slot', () => {
    localStorage.setItem(DraftStorageService.V2_KEY, '{not json');
    expect(service.load()).toBeNull();
  });

  it('returns null for v2 data with the wrong shape', () => {
    localStorage.setItem(DraftStorageService.V2_KEY, JSON.stringify({ version: 1, foo: 'bar' }));
    expect(service.load()).toBeNull();
  });

  it('falls through to v1 migration when v2 is corrupted', () => {
    localStorage.setItem(DraftStorageService.V2_KEY, '{not json');
    const v1: GraphSnapshot = makeSnapshot();
    localStorage.setItem(DraftStorageService.V1_KEY, JSON.stringify(v1));

    // First call sees corrupt v2 (null), then v1 exists — migration kicks in
    const draft = service.load();
    expect(draft).not.toBeNull();
    expect(draft!.version).toBe(2);
  });

  it('returns null for malformed v1 payload', () => {
    localStorage.setItem(DraftStorageService.V1_KEY, JSON.stringify({ junk: true }));
    expect(service.load()).toBeNull();
  });

  it('clear() removes both v1 and v2 keys', () => {
    localStorage.setItem(DraftStorageService.V1_KEY, JSON.stringify(makeSnapshot()));
    service.saveSnapshot(makeSnapshot());
    expect(localStorage.getItem(DraftStorageService.V1_KEY)).not.toBeNull();
    expect(localStorage.getItem(DraftStorageService.V2_KEY)).not.toBeNull();

    service.clear();
    expect(localStorage.getItem(DraftStorageService.V1_KEY)).toBeNull();
    expect(localStorage.getItem(DraftStorageService.V2_KEY)).toBeNull();
  });

  it('saveSnapshot defaults dirty=true and filePath=null', () => {
    service.saveSnapshot(makeSnapshot());
    const draft = service.load();
    expect(draft!.dirty).toBe(true);
    expect(draft!.filePath).toBeNull();
  });
});
