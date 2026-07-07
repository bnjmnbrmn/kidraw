import { Injectable } from '@angular/core';

/**
 * The vault — kidraw's storage seam (see notes/decision-vault-model.md).
 *
 * A vault is a place kidraw can list, read, and write graph/style files
 * without any per-operation dialog. Implementation #1 is a local directory
 * granted once via the File System Access API (Chromium); a cloud workspace
 * can become implementation #2 behind the same interface.
 */
export interface Vault {
  /** Human-readable vault name (directory basename for the local vault). */
  readonly name: string;
  /** Recursive listing of kidraw files (vault-root-relative paths, sorted). */
  list(): Promise<string[]>;
  /** File content, or null if the path doesn't exist. */
  read(path: string): Promise<string | null>;
  /** Write (creating the file and any parent directories as needed). */
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  /** Modification timestamp (ms), or null if the path doesn't exist. Cheap —
   *  used for external-change polling; does not read the content. */
  lastModified(path: string): Promise<number | null>;
}

export type VaultStatus = 'disconnected' | 'needs-permission' | 'connected';

// ─── FSA typings ────────────────────────────────────────────────────────────
// showDirectoryPicker, directory iteration, and the permission methods are
// Chromium-only and absent from lib.dom, so we keep local structural types
// and cast at the boundary.

interface FsaWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FsaFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsaWritable>;
}

interface FsaDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsaFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsaDirectoryHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<FsaFileHandle | FsaDirectoryHandle>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

// ─── Path helpers (pure; unit-tested) ───────────────────────────────────────

/** Normalize a vault-relative path: forward slashes, no leading "./" or "/",
 *  no empty or "." segments. Throws on ".." (the vault is a sandbox). */
export function normalizeVaultPath(path: string): string {
  const segments = path
    .replace(/\\/g, '/')
    .split('/')
    .filter(s => s !== '' && s !== '.');
  if (segments.some(s => s === '..')) {
    throw new Error(`Path escapes the vault: ${path}`);
  }
  return segments.join('/');
}

/** Ensure a user-entered filename is a kidraw graph file. Bare names get
 *  ".kidraw.yaml"; plain ".yaml"/".yml"/".json" names get the "kidraw"
 *  marker inserted; already-correct names pass through. */
export function ensureKidrawFilename(name: string): string {
  const normalized = normalizeVaultPath(name);
  if (/\.kidraw\.(json|ya?ml)$/i.test(normalized)) return normalized;
  const plainExt = normalized.match(/\.(json|ya?ml)$/i);
  if (plainExt) {
    return `${normalized.slice(0, -plainExt[0].length)}.kidraw${plainExt[0]}`;
  }
  return `${normalized}.kidraw.yaml`;
}

/** True for files the vault listing should surface. */
export function isVaultListedFile(name: string): boolean {
  return /\.(kidraw|kd-style)\.(json|ya?ml)$/i.test(name);
}

// ─── Local FSA implementation ───────────────────────────────────────────────

class LocalFsaVault implements Vault {
  constructor(private root: FsaDirectoryHandle) {}

  get name(): string {
    return this.root.name;
  }

  async list(): Promise<string[]> {
    const found: string[] = [];
    await this.walk(this.root, '', found);
    return found.sort();
  }

  private async walk(dir: FsaDirectoryHandle, prefix: string, out: string[]): Promise<void> {
    for await (const entry of dir.values()) {
      if (entry.name.startsWith('.')) continue; // .git and friends
      if (entry.kind === 'directory') {
        await this.walk(entry, `${prefix}${entry.name}/`, out);
      } else if (isVaultListedFile(entry.name)) {
        out.push(`${prefix}${entry.name}`);
      }
    }
  }

  async read(path: string): Promise<string | null> {
    const handle = await this.fileHandle(path, false);
    if (!handle) return null;
    const file = await handle.getFile();
    return file.text();
  }

  async write(path: string, content: string): Promise<void> {
    const handle = await this.fileHandle(path, true);
    if (!handle) throw new Error(`Could not create ${path}`);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async delete(path: string): Promise<void> {
    const segments = normalizeVaultPath(path).split('/');
    const dir = await this.directoryOf(segments, false);
    if (!dir) return;
    await dir.removeEntry(segments[segments.length - 1]);
  }

  async lastModified(path: string): Promise<number | null> {
    const handle = await this.fileHandle(path, false);
    if (!handle) return null;
    const file = await handle.getFile();
    return file.lastModified;
  }

  private async fileHandle(path: string, create: boolean): Promise<FsaFileHandle | null> {
    const segments = normalizeVaultPath(path).split('/');
    if (segments.length === 0 || segments[0] === '') return null;
    const dir = await this.directoryOf(segments, create);
    if (!dir) return null;
    try {
      return await dir.getFileHandle(segments[segments.length - 1], { create });
    } catch {
      return null;
    }
  }

  /** Directory handle containing the last segment of `segments`. */
  private async directoryOf(segments: string[], create: boolean): Promise<FsaDirectoryHandle | null> {
    let dir = this.root;
    for (const segment of segments.slice(0, -1)) {
      try {
        dir = await dir.getDirectoryHandle(segment, { create });
      } catch {
        return null;
      }
    }
    return dir;
  }
}

// ─── IndexedDB persistence for the directory handle ────────────────────────

const IDB_NAME = 'kidraw-vault';
const IDB_STORE = 'handles';
const IDB_KEY = 'dir';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetHandle(): Promise<FsaDirectoryHandle | null> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as FsaDirectoryHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPutHandle(handle: FsaDirectoryHandle): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(handle, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Persistence failure just means re-picking after a reload.
  }
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class VaultService {
  /** localStorage key for the vault-relative path of the open graph file. */
  static readonly PATH_KEY = 'kidraw_vault_path_v1';

  private dirHandle: FsaDirectoryHandle | null = null;
  private _vault: Vault | null = null;
  private _status: VaultStatus = 'disconnected';

  static isSupported(): boolean {
    return typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
  }

  get status(): VaultStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  /** The active vault, or null when not connected. */
  get vault(): Vault | null {
    return this._status === 'connected' ? this._vault : null;
  }

  get directoryName(): string | null {
    return this.dirHandle?.name ?? null;
  }

  /** Vault-relative path of the open graph file (persisted), or null. */
  get currentFilePath(): string | null {
    return localStorage.getItem(VaultService.PATH_KEY);
  }

  set currentFilePath(path: string | null) {
    if (path === null) localStorage.removeItem(VaultService.PATH_KEY);
    else localStorage.setItem(VaultService.PATH_KEY, path);
  }

  /**
   * Startup restore: load the stored directory handle and check permission.
   * No user gesture available here, so a 'prompt' permission state lands in
   * 'needs-permission' — connectOrReconnect() (from a keypress) resolves it.
   */
  async tryRestore(): Promise<VaultStatus> {
    if (!VaultService.isSupported()) return this._status;
    const handle = await idbGetHandle();
    if (!handle) return this._status;
    this.dirHandle = handle;
    const permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
    this.setStatus(permission === 'granted' ? 'connected' : 'needs-permission');
    return this._status;
  }

  /**
   * User-gesture entry point. Re-requests permission on the stored handle if
   * one is waiting; otherwise opens the directory picker (also used to switch
   * vaults). Returns the resulting status.
   */
  async connectOrReconnect(): Promise<VaultStatus> {
    if (!VaultService.isSupported()) return this._status;

    if (this._status === 'needs-permission' && this.dirHandle?.requestPermission) {
      const permission = await this.dirHandle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        this.setStatus('connected');
        return this._status;
      }
    }

    const picker = (window as unknown as {
      showDirectoryPicker(opts: { mode: string }): Promise<FsaDirectoryHandle>;
    }).showDirectoryPicker;
    try {
      const handle = await picker({ mode: 'readwrite' });
      this.dirHandle = handle;
      await idbPutHandle(handle);
      this.setStatus('connected');
    } catch {
      // User cancelled the picker — status unchanged.
    }
    return this._status;
  }

  private setStatus(status: VaultStatus): void {
    this._status = status;
    this._vault = status === 'connected' && this.dirHandle
      ? new LocalFsaVault(this.dirHandle)
      : null;
  }
}
