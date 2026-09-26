import {TestBed} from '@angular/core/testing';
import {DACommandType} from '../drawing-area/command.model';
import {PluginSettingsService} from '../plugins/plugin-settings.service';
import {AgentStore, graphIdentity} from './agent-store';

describe('AgentStore', () => {
  let enabled: boolean;
  let store: AgentStore;

  beforeEach(() => {
    enabled = true;
    localStorage.removeItem('kidraw_agent_detail_v1');
    TestBed.configureTestingModule({
      providers: [{provide: PluginSettingsService, useValue: {isEnabled: () => enabled}}],
    });
    store = TestBed.inject(AgentStore);
  });

  afterEach(() => localStorage.removeItem('kidraw_agent_detail_v1'));

  it('takes the chat\'s commands and no others', () => {
    spyOn(store, 'follow');
    expect(store.runCommand(DACommandType.FOLLOW_AGENT)).toBeTrue();
    expect(store.follow).toHaveBeenCalled();
    expect(store.runCommand(DACommandType.UNDO)).toBeFalse();
  });

  it('says so, and does nothing, when AI Chat is turned off', () => {
    enabled = false;
    spyOn(store, 'follow');
    expect(store.runCommand(DACommandType.FOLLOW_AGENT)).toBeTrue();
    expect(store.follow).not.toHaveBeenCalled();
    expect(store.notice()?.text).toBe('AI Chat is turned off in Settings');
  });

  it(':detail reports, sets and refuses levels', () => {
    expect(store.detailCommand('thorough')).toContain('Detail: thorough');
    expect(store.detailLevel()).toBe('thorough');
    expect(store.detailCommand('')).toContain('Detail: thorough.');
    expect(store.detailCommand('huge')).toBe('Not a detail level: huge. Choose brief, standard, thorough.');
  });

  it('names the hint keys after the key profile', () => {
    store.useKeys({chat: 'm', askAboutSelection: 'o', follow: 'o'});
    expect(store.keyLabels()).toEqual({chat: 'm', ask: 'o', follow: 'Shift+O', close: 'Shift+M'});
  });
});

describe('graphIdentity', () => {
  it('knows a vault file by vault and path, and each Untitled graph as its own', () => {
    expect(graphIdentity({vaultName: 'notes', path: 'plans.kidraw.yaml'}, 3))
      .toEqual({key: 'notes:plans.kidraw.yaml', title: 'plans.kidraw.yaml', stable: true});
    expect(graphIdentity({vaultName: null, path: 'Untitled'}, 3))
      .toEqual({key: 'local:Untitled#3', title: 'Untitled', stable: false});
  });
});
