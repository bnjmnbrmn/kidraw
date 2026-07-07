import {
  ensureKidrawFilename,
  isVaultListedFile,
  normalizeVaultPath,
} from './vault.service';

describe('normalizeVaultPath', () => {
  it('strips leading ./ and slashes', () => {
    expect(normalizeVaultPath('./todos.kidraw.yaml')).toBe('todos.kidraw.yaml');
    expect(normalizeVaultPath('/todos.kidraw.yaml')).toBe('todos.kidraw.yaml');
  });

  it('normalizes backslashes and empty segments', () => {
    expect(normalizeVaultPath('sub\\dir//file.kidraw.yaml')).toBe('sub/dir/file.kidraw.yaml');
  });

  it('drops "." segments', () => {
    expect(normalizeVaultPath('sub/./file.kidraw.yaml')).toBe('sub/file.kidraw.yaml');
  });

  it('rejects ".." segments', () => {
    expect(() => normalizeVaultPath('../escape.kidraw.yaml')).toThrow();
    expect(() => normalizeVaultPath('sub/../../escape.yaml')).toThrow();
  });
});

describe('ensureKidrawFilename', () => {
  it('appends .kidraw.yaml to bare names', () => {
    expect(ensureKidrawFilename('todos')).toBe('todos.kidraw.yaml');
  });

  it('inserts the kidraw marker into plain yaml/json names', () => {
    expect(ensureKidrawFilename('todos.yaml')).toBe('todos.kidraw.yaml');
    expect(ensureKidrawFilename('todos.yml')).toBe('todos.kidraw.yml');
    expect(ensureKidrawFilename('todos.json')).toBe('todos.kidraw.json');
  });

  it('passes through correct names', () => {
    expect(ensureKidrawFilename('todos.kidraw.yaml')).toBe('todos.kidraw.yaml');
    expect(ensureKidrawFilename('sub/todos.kidraw.json')).toBe('sub/todos.kidraw.json');
  });

  it('normalizes the path while at it', () => {
    expect(ensureKidrawFilename('./todos')).toBe('todos.kidraw.yaml');
  });
});

describe('isVaultListedFile', () => {
  it('accepts kidraw graph and style files', () => {
    expect(isVaultListedFile('a.kidraw.yaml')).toBeTrue();
    expect(isVaultListedFile('a.kidraw.json')).toBeTrue();
    expect(isVaultListedFile('a.kd-style.yml')).toBeTrue();
  });

  it('rejects other files', () => {
    expect(isVaultListedFile('a.yaml')).toBeFalse();
    expect(isVaultListedFile('a.kidraw.zip')).toBeFalse();
    expect(isVaultListedFile('notes.md')).toBeFalse();
  });
});
