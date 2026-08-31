import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {AppComponent} from './app.component';
import {KeymenuComponent} from './keymenu/keymenu.component';
import {CompactKeymenuComponent} from './keymenu/compact/compact-keymenu.component';
import {DACommandType} from './drawing-area/command.model';
import {HeaderComponent} from './header/header.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the app structure', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    
    // Should have main components
    expect(compiled.querySelector('app-header')).toBeTruthy();
    expect(compiled.querySelector('app-drawing-area')).toBeTruthy();
    expect(compiled.querySelector('app-keymenu')).toBeTruthy();
  });

  it('should not render interaction profile tabs', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const tabButtons = compiled.querySelectorAll('.interaction-profile-tab');
    expect(tabButtons.length).toBe(0);
  });

  it('should pass movementSpeed to keymenu component', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const keymenu = fixture.debugElement.query(By.directive(KeymenuComponent)).componentInstance as KeymenuComponent;
    expect(keymenu.movementSpeed).toBe(fixture.componentInstance.movementSpeed);
  });

  // 2026-08-15 (da-200): the toggle cycles three presentations —
  // keyboard → compact tree → hidden → keyboard. The keyboard overlay is
  // still only hidden, never destroyed, in the two non-keyboard states.
  it('should cycle keyboard → compact → hidden without destroying the keymenu', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const keymenuDebug = fixture.debugElement.query(By.directive(KeymenuComponent));

    expect(app.keymenuDisplay).toBe('keyboard');
    expect(keymenuDebug.componentInstance.visible).toBeTrue();

    app.toggleKeymenuVisibility();
    fixture.detectChanges();

    expect(app.keymenuDisplay).toBe('compact');
    expect(fixture.debugElement.query(By.directive(KeymenuComponent))).toBe(keymenuDebug);
    expect(keymenuDebug.nativeElement.classList).toContain('keymenu-hidden');
    expect(keymenuDebug.componentInstance.visible).toBeFalse();
    expect(keymenuDebug.nativeElement.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.debugElement.query(By.directive(CompactKeymenuComponent))).not.toBeNull();

    app.toggleKeymenuVisibility();
    fixture.detectChanges();

    expect(app.keymenuDisplay).toBe('hidden');
    expect(fixture.debugElement.query(By.directive(KeymenuComponent))).toBe(keymenuDebug);
    expect(keymenuDebug.componentInstance.visible).toBeFalse();
    expect(fixture.debugElement.query(By.directive(CompactKeymenuComponent))).toBeNull();

    app.toggleKeymenuVisibility();
    fixture.detectChanges();

    expect(app.keymenuDisplay).toBe('keyboard');
    expect(keymenuDebug.nativeElement.classList).not.toContain('keymenu-hidden');
    expect(keymenuDebug.componentInstance.visible).toBeTrue();
  });

  it('mirrors the keymenu compact model into the panel inputs', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;

    app.onCompactModel({
      rows: [{key: 'g', label: 'Move by node...', depth: 0, isSubmenu: true, held: true},
             {key: 'h', label: 'Stop Left', depth: 1, isSubmenu: false, held: false}],
      hint: '',
    });
    app.onModeLabel({text: 'normal', color: '#5b9bd5'});
    app.keymenuDisplay = 'compact';
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.directive(CompactKeymenuComponent));
    expect(panel).not.toBeNull();
    expect(panel.componentInstance.rows.length).toBe(2);
    expect(panel.componentInstance.rows[1].depth).toBe(1);
    expect(panel.componentInstance.modeName).toBe('normal');
    expect(panel.componentInstance.modeColor).toBe('#5b9bd5');
  });

  it('shows the typing hint instead of rows while free-typing', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;

    app.onCompactModel({rows: [], hint: 'Go ahead and type.'});
    app.onModeLabel({text: 'edit', color: '#70ad47'});
    app.keymenuDisplay = 'compact';
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.directive(CompactKeymenuComponent));
    expect(panel.componentInstance.hint).toBe('Go ahead and type.');
    expect(panel.componentInstance.rows.length).toBe(0);
  });

  it('relays label edit submodes to the drawing cursor', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const next = spyOn(app.commandsSubject, 'next');

    app.handleLabelEditModeChange('vimNormal');
    app.handleLabelEditModeChange('insert');

    expect(next.calls.allArgs()).toEqual([
      [{kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'vimNormal'}],
      [{kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'insert'}],
    ]);
  });

  it('starts existing text in Vim normal and new text in insert mode', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const enter = spyOn(app.keymenuComponent, 'enterLabelEditMode');
    const next = spyOn(app.commandsSubject, 'next');

    app.handleDANotification({kind: 'started-label-editing-mode', mode: 'vimNormal'});
    app.handleDANotification({kind: 'started-label-editing-mode', mode: 'insert'});

    expect(enter.calls.allArgs()).toEqual([['vimNormal'], ['insert']]);
    expect(next.calls.allArgs()).toEqual([
      [{kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'vimNormal'}],
      [{kind: DACommandType.SET_TEXT_CURSOR_MODE, mode: 'insert'}],
    ]);
  });

  it('preserves separate vault and path fields when file state reaches the header', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const header = fixture.debugElement.query(By.directive(HeaderComponent))
      .componentInstance as HeaderComponent;

    app.handleDANotification({
      kind: 'file-state-update',
      fileState: {
        storage: 'vault',
        vaultName: 'work',
        path: 'work/nested/graph.kidraw.yaml',
      },
    });

    expect(header.fileIdentity).toEqual({
      vaultName: 'work',
      path: 'work/nested/graph.kidraw.yaml',
    });
  });
});
