import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {AppComponent} from './app.component';
import {KeymenuComponent} from './keymenu/keymenu.component';

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

  it('should hide and restore the keyboard menu without destroying it', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const keymenuDebug = fixture.debugElement.query(By.directive(KeymenuComponent));

    expect(keymenuDebug.componentInstance.visible).toBeTrue();

    app.toggleKeymenuVisibility();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(KeymenuComponent))).toBe(keymenuDebug);
    expect(keymenuDebug.nativeElement.classList).toContain('keymenu-hidden');
    expect(keymenuDebug.componentInstance.visible).toBeFalse();
    expect(keymenuDebug.nativeElement.getAttribute('aria-hidden')).toBe('true');

    app.toggleKeymenuVisibility();
    fixture.detectChanges();

    expect(keymenuDebug.nativeElement.classList).not.toContain('keymenu-hidden');
    expect(keymenuDebug.componentInstance.visible).toBeTrue();
  });
});
