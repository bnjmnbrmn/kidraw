/**
 * Everything the drawing area does with files.
 *
 * Opening and saving, the vault and its auto-save, the ex line, named graphs
 * in local storage, and which display of a document is showing. Moves graphs
 * in and out of the canvas, restores their view, and tells the header what
 * is open.
 *
 * It keeps its own bookkeeping: which document was opened and with which style
 * resolver, the vault's timers and the file's last-seen modification time. All
 * of that belonged to this feature and none of it to the canvas.
 *
 * The host supplies storage services, access to the canvas and viewport,
 * and notifications for the rest of the app.
 */
import type { EventEmitter } from '@angular/core';

import type { DemoDataService } from '../services/demo-data.service';
import type { ThemeService } from '../services/theme.service';
import type { VisualConfigService } from '../services/visual-config.service';
import type { DebugLogService } from '../services/debug-log.service';
import type { DraftStorageService } from '../services/draft-storage.service';
import { FileIoService } from '../services/file-io.service';
import type { GraphStorageService } from '../services/graph-storage.service';
import type { DrawingLayer } from './drawing.layer';
import type { CrosshairsLayer } from './crosshairs.layer';
import type { UndoRedoService } from './undo-redo.service';
import type { Viewport } from './viewport';
import type { DAFileState, DANotification } from './da-notification.model';
import type { DANode } from './da-node';
import type { GraphSnapshot } from './graph-snapshot';
import type { PluginSettingsService } from '../plugins/plugin-settings.service';
import { DACommandType } from './command.model';
import type { CommandSlice } from './command-handlers';
import { diagramTypes, getPlugin, resolveIdentity } from '../plugins/plugin-registry';
import { isYamlFilename, parseGraphDocByFilename, parseStyleSetByFilename, serializeGraphDocByFilename, serializeStyleSetByFilename } from '../lib/file-format/parser';
import { ImportResolver, resolveAndApplyToGraph } from '../lib/file-format/resolver';
import { filesToSnapshot, snapshotToFiles } from '../lib/file-format/snapshot-mapping';
import { InlineStyleSet, KidrawGraphDoc, KidrawStyleSet, styleRefId } from '../lib/file-format/types';
import { PackedFile, findManifest, packZip, unpackZip } from '../lib/file-format/zip-bundle';
import { Vault, VaultService, ensureKidrawFilename, normalizeVaultPath } from '../services/vault.service';

/** What the file region needs from the drawing area that owns it. */
export interface FileHost {
  // --- the canvas ---
  readonly drawingLayer: DrawingLayer;
  readonly crosshairsLayer: CrosshairsLayer;
  readonly viewport: Viewport;
  readonly daOut: EventEmitter<DANotification>;

  // --- services it shares with the component ---
  readonly vaultService: VaultService;
  readonly fileIo: FileIoService;
  readonly graphStorage: GraphStorageService;
  readonly demoDataService: DemoDataService;
  readonly draftStorage: DraftStorageService;
  readonly undoRedoService: UndoRedoService;
  readonly themeService: ThemeService;
  readonly visualConfigService: VisualConfigService;
  readonly log: DebugLogService;
  readonly pluginSettings: PluginSettingsService;

  // --- telling the rest of the app that the graph changed under it ---
  emitStatus(message: string): void;
  emitContextState(): void;
  emitZoomLevel(): void;
  checkAndEmitEditState(): void;
  finishTweens(): void;
  unselectAllLabels(): void;
  fitViewToContent(): void;
  recenterCrosshairs(): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
}


function defaultGraphFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  // YAML is the default save format.
  return `kidraw-${stamp}.kidraw.yaml`;
}

/** Strip leading "./" and normalize separators for archive-relative paths. */
function normalizeArchivePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\/g, '/');
}

/** Debounce between the last graph edit and writing it back to the vault. */
const VAULT_AUTOSAVE_DEBOUNCE_MS = 1000;
/** How often to check whether the vault file changed under us. */
const VAULT_POLL_INTERVAL_MS = 1500;

export class FileController {
  constructor(private readonly host: FileHost) {}

  /** The file commands: files, the vault, named and sample graphs, the
   *  display cycle, and ex commands. */
  commands() {
    return {
      [DACommandType.NEW_GRAPH]: () => this.newGraph(),
      [DACommandType.OPEN_FILE]: () => void this.openFile(),
      [DACommandType.SAVE_FILE_AS]: () => this.saveFileAs(),
      [DACommandType.EXPORT_ZIP]: () => this.exportZip(),
      [DACommandType.CONNECT_VAULT]: () => void this.connectVault(),
      [DACommandType.VAULT_OPEN]: () => void this.vaultOpen(),
      [DACommandType.VAULT_SAVE_AS]: () => void this.vaultSaveAs(),
      [DACommandType.SAVE_GRAPH_AS]: c => this.saveGraphAs(c.name),
      [DACommandType.LOAD_NAMED_GRAPH]: c => this.loadNamedGraph(c.graphSnapshot),
      [DACommandType.LOAD_SAMPLE_GRAPH]: c => this.loadSampleGraph(c.graphId),
      [DACommandType.CYCLE_DISPLAY]: () => this.cycleDisplay(),
      [DACommandType.EX_COMMAND]: c => void this.runExCommand(c.text),
    } satisfies CommandSlice;
  }

  /**
   * Remember the viewport a restored draft was showing.
   *
   * `initVault` reopens the vault file moments later and would otherwise
   * re-fit the graph, throwing away the place the user was at before the
   * refresh. Consumed once, by that reopen.
   */
  noteStartupDraftView(view: {x: number; y: number; scale: number} | null): void {
    this.startupDraftView = view;
  }

  /** Stop the vault's timers. Called when the drawing area is destroyed. */
  dispose(): void {
    this.cancelVaultAutoSave();
    if (this.vaultPollTimer !== null) {
      clearInterval(this.vaultPollTimer);
      this.vaultPollTimer = null;
    }
  }

  /** Viewport from the draft loaded at startup, so a vault reopen keeps the
   *  user's place instead of re-fitting. Consumed once by initVault. */
  private startupDraftView: {x: number; y: number; scale: number} | null = null;

  /** Debounced auto-save to the vault-backed file (null = nothing pending). */
  private vaultSaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Guards the external-change poll against reacting to our own writes. */
  private vaultWriteInFlight = false;

  private vaultPollTimer: ReturnType<typeof setInterval> | null = null;

  /** lastModified of the vault file as of our most recent read/write. */
  private vaultLastModified = 0;

  /** The graph doc + style resolver from the most-recent Open. Used to
   *  switch between top-level displays after the file is loaded. */
  private openedDoc: KidrawGraphDoc | null = null;

  private openedStyleResolver: ImportResolver | null = null;

  private activeStyleIndex = 0;

  private lastFileStateKey: string | undefined;

  private vaultReloadInFlight = false;

  loadSampleGraph(graphId: string): void {
    this.detachVaultFile();
    this.host.finishTweens();
    this.host.unselectAllLabels();
    this.host.undoRedoService.clear();
    this.host.demoDataService.loadGraph(graphId, this.host.drawingLayer);
    const palette = this.host.visualConfigService.getEffectivePalette(this.host.themeService.theme);
    this.host.drawingLayer.applyThemeColors(palette);
    this.host.fitViewToContent();
    this.host.recenterCrosshairs();
    this.host.emitZoomLevel();
    this.host.checkAndEmitEditState();
  }

  saveGraphToStorage(): void {
    this.host.finishTweens();
    const snapshot = this.host.drawingLayer.serializeGraph();
    this.host.draftStorage.saveSnapshot(snapshot, {view: this.currentViewport()});
  }

  /** The drawing-layer viewport: pan (stage px) + uniform scale. */
  private currentViewport(): {x: number; y: number; scale: number} {
    return {x: this.host.drawingLayer.x(), y: this.host.drawingLayer.y(), scale: this.host.drawingLayer.scaleX()};
  }

  /** Restore a saved viewport (pan + zoom) and re-center the crosshairs in
   *  the visible area. Returns false if the view was absent/invalid so the
   *  caller can fall back to fit-to-content. */
  restoreViewport(view: {x: number; y: number; scale: number} | undefined): boolean {
    if (!view || !isFinite(view.x) || !isFinite(view.y) || !(view.scale > 0)) return false;
    this.host.drawingLayer.scale({x: view.scale, y: view.scale});
    this.host.drawingLayer.position({x: view.x, y: view.y});
    this.host.crosshairsLayer.crosshairs.x = this.host.viewport.centerX;
    this.host.crosshairsLayer.crosshairs.y = this.host.viewport.centerY;
    this.host.drawingLayer.batchDraw();
    this.host.emitZoomLevel();
    return true;
  }

  async openFile(): Promise<void> {
    const accept = FileIoService.KIDRAW_ACCEPT;
    const opened = await this.host.fileIo.openBinaryFile(accept);
    if (!opened) return;

    const lower = opened.name.toLowerCase();
    const isZip = lower.endsWith('.zip');

    let manifestText: string;
    let manifestName: string;
    let styleResolver: ImportResolver;

    if (isZip) {
      let unpacked: PackedFile[];
      try {
        unpacked = unpackZip(opened.bytes);
      } catch (e) {
        window.alert(`Could not unpack ${opened.name}:\n\n${(e as Error).message}`);
        return;
      }
      const manifest = findManifest(unpacked);
      if (!manifest) {
        window.alert(`${opened.name} doesn't contain a .kidraw.{json,yaml} manifest file.`);
        return;
      }
      manifestText = manifest.content;
      manifestName = manifest.name;
      const byPath = new Map<string, PackedFile>();
      for (const f of unpacked) byPath.set(normalizeArchivePath(f.name), f);
      styleResolver = (path: string) => {
        const found = byPath.get(normalizeArchivePath(path));
        if (!found) return null;
        const parsed = parseStyleSetByFilename(found.content, found.name);
        return parsed.ok ? parsed.value : null;
      };
    } else {
      manifestText = new TextDecoder().decode(opened.bytes);
      manifestName = opened.name;
      styleResolver = (_path: string) => null; // pre-populated cache below
    }

    const parsed = parseGraphDocByFilename(manifestText, manifestName);
    if (!parsed.ok) {
      window.alert(`Could not open ${manifestName}:\n\n${parsed.error}`);
      return;
    }

    // For plain (non-zip) opens, prompt-on-miss to gather any external
    // style files referenced by the graph (top-level + transitive imports).
    if (!isZip) {
      const cache = new Map<string, KidrawStyleSet>();
      const declined = new Set<string>();
      await this.gatherExternalStyles(parsed.value.styles, cache, declined);
      styleResolver = (path: string) => cache.get(normalizeArchivePath(path)) ?? null;
    }

    const resolvedStyle = this.resolveStyleAtIndex(parsed.value, 0, styleResolver);
    if (resolvedStyle === null) return;

    // A picker-opened file is not vault-backed; stop auto-saving to the
    // previously-open vault file.
    this.detachVaultFile();

    // Save open-state so the user can cycle through other displays later.
    this.openedDoc = parsed.value;
    this.openedStyleResolver = styleResolver;
    this.activeStyleIndex = 0;

    this.replaceGraph(filesToSnapshot(parsed.value, resolvedStyle));
    this.host.fitViewToContent();
    this.host.recenterCrosshairs();
    this.host.emitZoomLevel();
    this.announceGraph();
    this.emitFileState({storage: 'external', path: manifestName});

    this.emitDisplayStatus(parsed.value);
  }

  /** Apply a registered plugin undoably; its defaults also govern new nodes.
   *  Takes its own undo snapshot and saves, because `:type` reaches it without
   *  a command — which is why SET_DIAGRAM_TYPE is missing from the mutating
   *  commands in command-policy.ts. */
  setDiagramType(typeId: string): void {
    const plugin = getPlugin(typeId);
    if (!plugin) {
      this.host.emitStatus(`⚠ Unknown diagram type: ${typeId}`);
      return;
    }
    if (plugin.feature) {
      this.host.emitStatus(`⚠ ${plugin.name} is not a diagram type`);
      return;
    }
    if (!this.host.pluginSettings.isEnabled(plugin.id)) {
      this.host.emitStatus(`⚠ ${plugin.name} is turned off in Settings`);
      return;
    }
    this.host.finishTweens();
    this.host.undoRedoService.pushSnapshot(this.host.drawingLayer.serializeGraph());
    this.host.drawingLayer.setDiagramType(plugin);
    this.host.updateEdgesForResizedNodes(this.host.drawingLayer.getDANodes());
    this.host.drawingLayer.batchDraw();
    this.host.emitStatus(`Diagram type: ${plugin.name}`);
    this.host.emitContextState();
    this.scheduleVaultAutoSave();
  }

  cycleDisplay(): void {
    if (!this.openedDoc || !this.openedStyleResolver) {
      this.host.daOut.emit({ kind: 'status-message', message: 'Open a graph file first to cycle displays.' });
      return;
    }
    const styles = this.openedDoc.styles;
    if (styles.length <= 1) {
      this.host.daOut.emit({ kind: 'status-message', message: `Only one display in this graph (${styleRefId(styles[0])}).` });
      return;
    }
    this.activeStyleIndex = (this.activeStyleIndex + 1) % styles.length;
    const resolvedStyle = this.resolveStyleAtIndex(this.openedDoc, this.activeStyleIndex, this.openedStyleResolver);
    if (resolvedStyle === null) return;

    this.replaceGraph(filesToSnapshot(this.openedDoc, resolvedStyle));
    this.host.fitViewToContent();
    this.host.emitZoomLevel();
    this.announceGraph();

    this.emitDisplayStatus(this.openedDoc);
  }

  /** Resolve styles[index] into a cascaded KidrawStyleSet (or null if it errors). */
  private resolveStyleAtIndex(
    doc: KidrawGraphDoc,
    index: number,
    resolver: ImportResolver,
  ): KidrawStyleSet | null {
    const ref = doc.styles[index];
    if (ref === undefined) return { kdStyle: 1 };
    const rootStyle = typeof ref === 'string'
      ? resolver(ref) ?? { kdStyle: 1 }
      : ref;
    const resolved = resolveAndApplyToGraph(doc, rootStyle, resolver);
    if (!resolved.ok) {
      window.alert(`Could not resolve display ${styleRefId(ref)}:\n\n${resolved.error}`);
      return null;
    }
    return resolved.value;
  }

  private emitDisplayStatus(doc: KidrawGraphDoc): void {
    if (doc.styles.length === 0) return;
    const name = styleRefId(doc.styles[this.activeStyleIndex]);
    const total = doc.styles.length;
    const message = total > 1
      ? `Display: ${name} (${this.activeStyleIndex + 1}/${total})`
      : `Display: ${name}`;
    this.host.daOut.emit({ kind: 'status-message', message });
  }

  /**
   * For every external (path-string) style reference in `styles[]` —
   * top-level and recursive imports — prompt the user to locate the file
   * via the OS picker. Builds out `cache` keyed by normalized requested path.
   * If the user declines a prompt, the path is added to `declined` so we
   * don't ask again in the same open.
   */
  private async gatherExternalStyles(
    refs: ReadonlyArray<string | InlineStyleSet>,
    cache: Map<string, KidrawStyleSet>,
    declined: Set<string>,
  ): Promise<void> {
    for (const ref of refs) {
      if (typeof ref === 'string') {
        await this.gatherExternalPath(ref, cache, declined);
      } else {
        // Inline style — still recurse into its imports (paths inside it).
        for (const importPath of ref.imports ?? []) {
          await this.gatherExternalPath(importPath, cache, declined);
        }
      }
    }
  }

  private async gatherExternalPath(
    path: string,
    cache: Map<string, KidrawStyleSet>,
    declined: Set<string>,
  ): Promise<void> {
    const key = normalizeArchivePath(path);
    if (cache.has(key) || declined.has(key)) return;

    const ok = window.confirm(`Locate referenced style file "${path}"?`);
    if (!ok) {
      declined.add(key);
      return;
    }
    const file = await this.host.fileIo.openTextFile(FileIoService.STYLE_ACCEPT);
    if (!file) {
      declined.add(key);
      return;
    }
    const parsed = parseStyleSetByFilename(file.content, file.name);
    if (!parsed.ok) {
      window.alert(`Could not parse ${file.name}:\n\n${parsed.error}`);
      declined.add(key);
      return;
    }
    cache.set(key, parsed.value);

    // Recurse into this style's own imports.
    for (const importPath of parsed.value.imports ?? []) {
      await this.gatherExternalPath(importPath, cache, declined);
    }
  }

  exportZip(): void {
    this.host.finishTweens();
    const snapshot = this.host.drawingLayer.serializeGraph();
    const { doc, style } = snapshotToFiles(snapshot);

    // Multi-file zip: one .kidraw.yaml manifest + one .kd-style.yaml sibling.
    const stylePath = './graph.kd-style.yaml';
    doc.styles = [stylePath];

    const manifestName = 'graph.kidraw.yaml';
    const styleName = 'graph.kd-style.yaml';

    const files: PackedFile[] = [
      { name: manifestName, content: serializeGraphDocByFilename(doc, manifestName) },
      { name: styleName, content: serializeStyleSetByFilename(style, styleName) },
    ];

    const bytes = packZip(files);
    const stamp = new Date().toISOString().slice(0, 10);
    this.host.fileIo.saveBinary(`kidraw-${stamp}.kidraw.zip`, bytes, 'application/zip');
  }

  saveFileAs(): void {
    this.host.finishTweens();
    const filename = defaultGraphFilename();
    const content = this.serializeCurrentGraphSingleFile(filename);
    const mime = isYamlFilename(filename) ? 'text/yaml' : 'application/json';
    this.host.fileIo.saveAs(filename, content, mime);
  }

  /**
   * Serialize the live graph as a self-contained single file: the style is
   * embedded inline so the result opens anywhere. (Multi-file save will land
   * in a later phase.)
   */
  private serializeCurrentGraphSingleFile(filename: string): string {
    const snapshot = this.host.drawingLayer.serializeGraph();
    const { doc, style } = snapshotToFiles(snapshot);
    const inline: InlineStyleSet = {
      name: 'default',
      ...(style.nodes ? { nodes: style.nodes } : {}),
      ...(style.edges ? { edges: style.edges } : {}),
      ...(style.imports ? { imports: style.imports } : {}),
      ...(style.tagStyles ? { tagStyles: style.tagStyles } : {}),
      ...(style.view ? { view: style.view } : {}),
    };
    doc.styles = [inline];
    return serializeGraphDocByFilename(doc, filename);
  }

  /** Tell the header which file is open (deduplicated — auto-save calls this
   *  on every write). Storage and path remain separate across this boundary. */
  private emitFileState(fileState: DAFileState): void {
    const stateKey = JSON.stringify(fileState);
    if (stateKey === this.lastFileStateKey) return;
    this.lastFileStateKey = stateKey;
    const displayLabel = fileState === null
      ? '(none)'
      : fileState.storage === 'vault'
        ? `${fileState.vaultName}/${fileState.path}`
        : fileState.path;
    this.host.log.log('[file]', displayLabel);
    this.host.daOut.emit({ kind: 'file-state-update', fileState });
  }

  async initVault(): Promise<void> {
    if (!VaultService.isSupported()) return;
    const status = await this.host.vaultService.tryRestore();
    this.host.log.log('[vault] startup restore:', status, 'storedPath:', this.host.vaultService.currentFilePath ?? '(none)');
    if (status === 'connected') {
      const path = this.host.vaultService.currentFilePath;
      if (path && await this.loadVaultFile(path, { restoreView: this.startupDraftView, recenter: true })) {
        this.host.emitStatus(`Vault: opened ${path}`);
      }
    } else if (status === 'needs-permission') {
      this.host.emitStatus('Vault needs reconnecting — file menu → Vault: Connect.');
    }
    this.vaultPollTimer = setInterval(
      () => void this.pollVaultFile(),
      VAULT_POLL_INTERVAL_MS,
    );
  }

  async runExCommand(text: string): Promise<void> {
    const [name, ...rest] = text.trim().split(/\s+/);
    const arg = rest.join(' ').trim();

    switch (name) {
      case 'w':
      case 'write':
        await this.exWrite(arg);
        return;
      case 'e':
      case 'edit':
      case 'o':
      case 'open':
        await this.exEdit(arg);
        return;
      case 'ls':
      case 'files':
        await this.exList();
        return;
      case 'enew':
      case 'new':
        this.newGraph();
        this.host.emitStatus('New graph.');
        return;
      case 'type':
      case 'plugin':
        this.exType(arg);
        return;
      default:
        this.host.emitStatus(`Not an editor command: ${name}`);
    }
  }

  /** `:type` lists the plugins (diagram types) that are on; `:type <id>`
   *  binds one to this graph, restyling it undoably. */
  private exType(arg: string): void {
    const current = this.host.drawingLayer.diagramType;
    if (arg === '') {
      const list = diagramTypes()
        .filter(plugin => plugin.id === current || this.host.pluginSettings.isEnabled(plugin.id))
        .map(plugin => plugin.id === current ? `${plugin.id} (current)` : plugin.id)
        .join(', ');
      this.host.emitStatus(`Plugins: ${list}. :type <name> switches.`);
      return;
    }
    if (arg === current) {
      this.host.emitStatus(`Already ${resolveIdentity(current).name}.`);
      return;
    }
    this.setDiagramType(arg);
  }

  /** `:w` saves to the open vault file; `:w <name>` saves as that name and
   *  makes it the open file, so the next bare `:w` goes there. */
  private async exWrite(arg: string): Promise<void> {
    if (!this.host.vaultService.isConnected) {
      this.host.emitStatus('No vault connected — use the File menu → Vault: Connect first.');
      return;
    }
    let path = arg === '' ? this.host.vaultService.currentFilePath : null;
    if (arg !== '') {
      try {
        path = ensureKidrawFilename(arg);
      } catch (e) {
        this.host.emitStatus((e as Error).message);
        return;
      }
    }
    if (!path) {
      this.host.emitStatus('No file name — use :w <name>.');
      return;
    }
    this.cancelVaultAutoSave();
    if (await this.writeGraphToVault(path)) {
      this.host.emitStatus(`Wrote ${path}`);
    }
  }

  /** `:e <name-or-number>` opens another vault file — the file switching
   *  this command line was asked for. */
  private async exEdit(arg: string): Promise<void> {
    if (!this.host.vaultService.isConnected) {
      this.host.emitStatus('No vault connected — use the File menu → Vault: Connect first.');
      return;
    }
    if (arg === '') {
      this.host.emitStatus('Which file? Use :e <name> (:ls lists them).');
      return;
    }
    const files = await this.exVaultFiles();
    const path = /^\d+$/.test(arg)
      ? files[parseInt(arg, 10) - 1]
      : files.find(f => f === normalizeVaultPath(arg)) ?? normalizeVaultPath(arg);
    if (!path) {
      this.host.emitStatus(`No such file: ${arg}`);
      return;
    }
    this.cancelVaultAutoSave();
    if (await this.loadVaultFile(path, {recenter: true})) {
      this.host.emitStatus(`Opened ${path}`);
    } else {
      this.host.emitStatus(`Could not open ${path}`);
    }
  }

  private async exList(): Promise<void> {
    if (!this.host.vaultService.isConnected) {
      this.host.emitStatus('No vault connected — use the File menu → Vault: Connect first.');
      return;
    }
    const files = await this.exVaultFiles();
    if (files.length === 0) {
      this.host.emitStatus('No graph files in the vault yet.');
      return;
    }
    const open = this.host.vaultService.currentFilePath;
    this.host.emitStatus(files
      .map((f, i) => `${i + 1}. ${f}${f === open ? '  (open)' : ''}`)
      .join('   '));
  }

  private async exVaultFiles(): Promise<string[]> {
    const vault = this.host.vaultService.vault;
    if (!vault) return [];
    return (await vault.list()).filter(f => /\.kidraw\./i.test(f));
  }

  async connectVault(): Promise<void> {
    if (!VaultService.isSupported()) {
      this.host.emitStatus('Vault requires a Chromium-based browser (File System Access API).');
      return;
    }
    const status = await this.host.vaultService.connectOrReconnect();
    if (status !== 'connected') {
      this.host.emitStatus('Vault not connected.');
      return;
    }
    const vault = this.host.vaultService.vault!;
    const files = await vault.list();
    this.host.emitStatus(`Vault connected: ${vault.name} (${files.length} kidraw file${files.length === 1 ? '' : 's'})`);

    // If a file was open in a previous session and the canvas is still
    // empty, resume it now that we have permission again.
    const path = this.host.vaultService.currentFilePath;
    const canvasEmpty = this.host.drawingLayer.getDANodes().length === 0;
    if (path && canvasEmpty && await this.loadVaultFile(path, { recenter: true })) {
      this.host.emitStatus(`Vault: opened ${path}`);
    }
  }

  async vaultSaveAs(): Promise<void> {
    if (!this.host.vaultService.isConnected) {
      this.host.emitStatus('Connect a vault first (file menu → Vault: Connect).');
      return;
    }
    const suggestion = this.host.vaultService.currentFilePath ?? 'graph.kidraw.yaml';
    const entered = window.prompt('Save in vault as:', suggestion);
    if (!entered || entered.trim() === '') return;
    let path: string;
    try {
      path = ensureKidrawFilename(entered.trim());
    } catch (e) {
      this.host.emitStatus((e as Error).message);
      return;
    }
    this.cancelVaultAutoSave();
    if (await this.writeGraphToVault(path)) {
      this.host.emitStatus(`Saved to vault: ${path} — auto-save is on`);
    }
  }

  async vaultOpen(): Promise<void> {
    if (!this.host.vaultService.isConnected) {
      this.host.emitStatus('Connect a vault first (file menu → Vault: Connect).');
      return;
    }
    const vault = this.host.vaultService.vault!;
    const files = (await vault.list()).filter(f => /\.kidraw\./i.test(f));
    if (files.length === 0) {
      this.host.emitStatus('No graph files in the vault yet — use Vault: Save As first.');
      return;
    }
    this.host.log.log('[vault] open picker,', files.length, 'files:', files.join(', '));
    const listing = files.map((f, i) => `${i + 1}. ${f}`).join('\n');
    const entered = window.prompt(`Open from vault (number or name):\n${listing}`, files[0]);
    if (!entered || entered.trim() === '') {
      this.host.log.log('[vault] open cancelled');
      return;
    }
    const trimmed = entered.trim();
    let path: string | undefined;
    try {
      path = /^\d+$/.test(trimmed)
        ? files[parseInt(trimmed, 10) - 1]
        : files.find(f => f === normalizeVaultPath(trimmed)) ?? normalizeVaultPath(trimmed);
    } catch (e) {
      this.host.emitStatus((e as Error).message);
      return;
    }
    if (!path) {
      this.host.emitStatus(`No such vault file: ${trimmed}`);
      return;
    }
    if (await this.loadVaultFile(path, { recenter: true })) {
      this.host.emitStatus(`Opened from vault: ${path} — auto-save is on`);
    }
  }

  /**
   * Load a graph file from the vault into the canvas and make it the
   * auto-save target. Does not emit a success status — callers word their
   * own. `recenter` is for user-initiated opens; external-change reloads
   * leave the viewport and crosshairs alone.
   */
  private async loadVaultFile(path: string,
      opts: { recenter?: boolean; restoreView?: {x: number; y: number; scale: number} | null } = {}): Promise<boolean> {
    const vault = this.host.vaultService.vault;
    if (!vault) return false;
    this.host.log.log('[vault] loading', path);
    const content = await vault.read(path);
    if (content === null) {
      this.host.emitStatus(`Vault: file not found: ${path}`);
      return false;
    }
    const parsed = parseGraphDocByFilename(content, path);
    if (!parsed.ok) {
      this.host.emitStatus(`Vault: could not parse ${path}: ${parsed.error}`);
      return false;
    }

    // Resolve external style references from the vault (relative to the
    // graph file's directory), mirroring the zip-internal resolver.
    const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const cache = new Map<string, KidrawStyleSet>();
    await this.gatherVaultStyles(parsed.value.styles, baseDir, cache, vault);
    const resolver: ImportResolver = p => cache.get(normalizeArchivePath(p)) ?? null;

    const resolvedStyle = this.resolveStyleAtIndex(parsed.value, 0, resolver);
    if (resolvedStyle === null) return false;

    this.openedDoc = parsed.value;
    this.openedStyleResolver = resolver;
    this.activeStyleIndex = 0;

    this.cancelVaultAutoSave();
    this.replaceGraph(filesToSnapshot(parsed.value, resolvedStyle));
    if (opts.restoreView && this.restoreViewport(opts.restoreView)) {
      // Draft viewport wins on a startup reopen — keeps the user's place.
    } else if (opts.recenter) {
      this.host.fitViewToContent();
      this.host.recenterCrosshairs();
      this.host.emitZoomLevel();
    }
    this.host.drawingLayer.batchDraw();
    this.announceGraph();

    this.host.vaultService.currentFilePath = path;
    this.vaultLastModified = (await vault.lastModified(path)) ?? Date.now();
    this.emitFileState({storage: 'vault', vaultName: vault.name, path});
    return true;
  }

  /** Read + parse external style references (and their transitive imports)
   *  out of the vault into `cache`, keyed like the zip resolver. */
  private async gatherVaultStyles(
    refs: ReadonlyArray<string | InlineStyleSet>,
    baseDir: string,
    cache: Map<string, KidrawStyleSet>,
    vault: Vault,
  ): Promise<void> {
    for (const ref of refs) {
      const paths = typeof ref === 'string' ? [ref] : (ref.imports ?? []);
      for (const p of paths) {
        await this.gatherVaultStylePath(p, baseDir, cache, vault);
      }
    }
  }

  private async gatherVaultStylePath(
    path: string,
    baseDir: string,
    cache: Map<string, KidrawStyleSet>,
    vault: Vault,
  ): Promise<void> {
    const key = normalizeArchivePath(path);
    if (cache.has(key)) return;
    let vaultPath: string;
    try {
      vaultPath = normalizeVaultPath(`${baseDir}${key}`);
    } catch {
      return;
    }
    const content = await vault.read(vaultPath);
    if (content === null) return;
    const parsed = parseStyleSetByFilename(content, vaultPath);
    if (!parsed.ok) return;
    cache.set(key, parsed.value);
    for (const importPath of parsed.value.imports ?? []) {
      await this.gatherVaultStylePath(importPath, baseDir, cache, vault);
    }
  }

  scheduleVaultAutoSave(): void {
    if (!this.host.vaultService.isConnected || !this.host.vaultService.currentFilePath) return;
    if (this.vaultSaveTimer !== null) clearTimeout(this.vaultSaveTimer);
    this.vaultSaveTimer = setTimeout(() => {
      this.vaultSaveTimer = null;
      void this.autoSaveToVault();
    }, VAULT_AUTOSAVE_DEBOUNCE_MS);
  }

  private cancelVaultAutoSave(): void {
    if (this.vaultSaveTimer !== null) {
      clearTimeout(this.vaultSaveTimer);
      this.vaultSaveTimer = null;
    }
  }

  private async autoSaveToVault(): Promise<void> {
    const path = this.host.vaultService.currentFilePath;
    if (!path || !this.host.vaultService.isConnected) return;
    if (await this.writeGraphToVault(path)) {
      this.host.emitStatus(`Saved: ${path}`);
    }
  }

  private async writeGraphToVault(path: string): Promise<boolean> {
    const vault = this.host.vaultService.vault;
    if (!vault) return false;
    this.vaultWriteInFlight = true;
    try {
      this.host.finishTweens();
      const content = this.serializeCurrentGraphSingleFile(path);
      await vault.write(path, content);
      this.host.vaultService.currentFilePath = path;
      this.vaultLastModified = (await vault.lastModified(path)) ?? Date.now();
      this.emitFileState({storage: 'vault', vaultName: vault.name, path});
      return true;
    } catch (e) {
      this.host.emitStatus(`Vault save failed: ${(e as Error).message}`);
      return false;
    } finally {
      this.vaultWriteInFlight = false;
    }
  }

  /** External-change poll: reload the open vault file when something else
   *  (an editor, an LLM) writes it. Local unsaved changes win. */
  private async pollVaultFile(): Promise<void> {
    if (document.hidden || this.vaultWriteInFlight || this.vaultReloadInFlight) return;
    const path = this.host.vaultService.currentFilePath;
    const vault = this.host.vaultService.vault;
    if (!path || !vault) return;
    const modified = await vault.lastModified(path);
    if (modified === null || modified <= this.vaultLastModified) return;
    if (this.vaultSaveTimer !== null) {
      // Dirty session: local wins (the pending auto-save will overwrite).
      this.vaultLastModified = modified;
      this.host.emitStatus(`${path} changed on disk while editing — keeping local changes.`);
      return;
    }
    this.vaultReloadInFlight = true;
    try {
      if (await this.loadVaultFile(path)) {
        this.host.emitStatus(`Reloaded — ${path} changed on disk.`);
      }
    } finally {
      this.vaultReloadInFlight = false;
    }
  }

  /** Called when a non-vault source replaces the graph: stop auto-saving to
   *  the previously-open vault file. */
  private detachVaultFile(): void {
    this.cancelVaultAutoSave();
    if (this.host.vaultService.currentFilePath) {
      this.host.vaultService.currentFilePath = null;
      this.host.emitStatus('Vault auto-save off — graph is no longer vault-backed.');
    }
    this.emitFileState(null);
  }

  saveGraphAs(name: string): void {
    this.host.finishTweens();
    const snapshot = this.host.drawingLayer.serializeGraph();
    this.host.graphStorage.save(name, snapshot);
    this.host.daOut.emit({ kind: 'status-message', message: `Saved as "${name}"` });
  }

  loadNamedGraph(snapshot: GraphSnapshot): void {
    this.detachVaultFile();
    this.replaceGraph(snapshot);
    this.host.fitViewToContent();
    this.host.recenterCrosshairs();
    this.host.emitZoomLevel();
    this.announceGraph();
    this.openedDoc = null;
    this.openedStyleResolver = null;
    this.activeStyleIndex = 0;
  }

  newGraph(): void {
    const hasContent = this.host.drawingLayer.getDANodes().length > 0 || this.host.drawingLayer.getDAEdges().length > 0;
    if (hasContent && !window.confirm('Start a new graph? This will clear the current diagram.')) return;
    this.detachVaultFile();
    this.replaceGraph({ nodes: [], edges: [] });
    // Drop any open-file context so display cycling doesn't reference the
    // previously-loaded doc after a fresh-start.
    this.openedDoc = null;
    this.openedStyleResolver = null;
    this.activeStyleIndex = 0;
    this.host.recenterCrosshairs();
    this.host.emitZoomLevel();
    this.announceGraph();
  }

  /** Put a whole new graph on the canvas: nothing left in flight, no undo
   *  history from the last one, the theme's colours. */
  private replaceGraph(snapshot: GraphSnapshot): void {
    this.host.finishTweens();
    this.host.unselectAllLabels();
    this.host.undoRedoService.clear();
    this.host.drawingLayer.restoreGraph(snapshot);
    this.host.drawingLayer.applyThemeColors(
      this.host.visualConfigService.getEffectivePalette(this.host.themeService.theme));
  }

  /** Tell the rest of the app a different graph is showing: what can be
   *  edited, and the context the header and keymenu show — the counts, and
   *  the diagram type, which decides the keymenu's `t`. Every load ends here;
   *  some used to skip the context, leaving the header a graph behind. */
  private announceGraph(): void {
    this.host.checkAndEmitEditState();
    this.host.emitContextState();
  }
}
