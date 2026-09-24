import {fakeAsync, flushMicrotasks, tick} from '@angular/core/testing';
import {DACommandType} from './command.model';
import {VaultService} from '../services/vault.service';
import {FileController, FileHost} from './file-controller';

describe('FileController vault lifecycle', () => {
  let files: FileController;
  let write: jasmine.Spy;
  let lastModified: jasmine.Spy;

  beforeEach(() => {
    write = jasmine.createSpy('write').and.resolveTo();
    lastModified = jasmine.createSpy('lastModified').and.resolveTo(0);
    files = new FileController({
      vaultService: {
        isConnected: true,
        currentFilePath: 'graph.kidraw.yaml',
        vault: {name: 'test-vault', write, lastModified},
        tryRestore: () => Promise.resolve('connected'),
      },
      drawingLayer: {serializeGraph: () => ({nodes: [], edges: []})},
      finishTweens: () => {},
      emitStatus: () => {},
      daOut: {emit: () => {}},
      log: {log: () => {}},
    } as unknown as FileHost);
  });

  it('coalesces edits into one write after the last edit settles', fakeAsync(() => {
    files.scheduleVaultAutoSave();
    tick(700);
    files.scheduleVaultAutoSave();
    tick(700);
    expect(write).not.toHaveBeenCalled();
    tick(300);
    expect(write).toHaveBeenCalledOnceWith('graph.kidraw.yaml', jasmine.any(String));
    files.dispose();
  }));

  it('stops pending writes and external-change polling when disposed', fakeAsync(() => {
    spyOn(VaultService, 'isSupported').and.returnValue(true);
    spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
    // No file to reopen during startup; attach one after polling has started.
    const host = (files as any).host as FileHost;
    host.vaultService.currentFilePath = null;
    void files.initVault();
    flushMicrotasks();
    host.vaultService.currentFilePath = 'graph.kidraw.yaml';
    tick(1500);
    expect(lastModified).toHaveBeenCalledTimes(1);
    files.scheduleVaultAutoSave();
    files.dispose();
    files.dispose();
    tick(3000);
    expect(write).not.toHaveBeenCalled();
    expect(lastModified).toHaveBeenCalledTimes(1);
  }));
});

describe('FileController commands', () => {
  it('handles the file commands itself, payload and all', () => {
    const files = new FileController({} as FileHost);
    const saveGraphAs = spyOn(files, 'saveGraphAs');
    const runExCommand = spyOn(files, 'runExCommand').and.resolveTo();
    const commands = files.commands();
    commands[DACommandType.SAVE_GRAPH_AS]({kind: DACommandType.SAVE_GRAPH_AS, name: 'plan'});
    commands[DACommandType.EX_COMMAND]({kind: DACommandType.EX_COMMAND, text: 'w'});
    expect(saveGraphAs).toHaveBeenCalledOnceWith('plan');
    expect(runExCommand).toHaveBeenCalledOnceWith('w');
  });
});

describe('FileController :type with a plugin turned off', () => {
  const files = (statuses: string[]) => new FileController({
    drawingLayer: {diagramType: 'default'},
    pluginSettings: {isEnabled: (id: string) => id !== 'explanation'},
    emitStatus: (message: string) => statuses.push(message),
    emitContextState: () => {},
    log: {log: () => {}},
  } as unknown as FileHost);

  it('does not offer it', async () => {
    const statuses: string[] = [];
    await files(statuses).runExCommand('type');
    expect(statuses[0]).toContain('todo-graph');
    expect(statuses[0]).not.toContain('explanation');
  });

  it('refuses to switch to it, and says why', async () => {
    const statuses: string[] = [];
    await files(statuses).runExCommand('type explanation');
    expect(statuses).toEqual(['⚠ Explanation is turned off in Settings']);
  });
});
