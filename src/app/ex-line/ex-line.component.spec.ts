import {ComponentFixture, TestBed} from '@angular/core/testing';

import {ExLineComponent} from './ex-line.component';

describe('ExLineComponent', () => {
  let fixture: ComponentFixture<ExLineComponent>;
  let component: ExLineComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [ExLineComponent]}).compileComponents();
    fixture = TestBed.createComponent(ExLineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', {key, cancelable: true});
    component.onKeyDown(event);
    return event;
  };

  it('should submit the trimmed command on Enter', () => {
    const submitted: string[] = [];
    component.submitCommand.subscribe(c => submitted.push(c));

    component.text = '  w notes.kidraw.yaml  ';
    press('Enter');

    expect(submitted).toEqual(['w notes.kidraw.yaml']);
  });

  it('should cancel rather than submit an empty line', () => {
    let submitted = 0;
    let canceled = 0;
    component.submitCommand.subscribe(() => submitted++);
    component.cancel.subscribe(() => canceled++);

    component.text = '   ';
    press('Enter');

    expect(submitted).toBe(0);
    expect(canceled).toBe(1);
  });

  it('should cancel on Escape', () => {
    let canceled = 0;
    component.cancel.subscribe(() => canceled++);

    press('Escape');

    expect(canceled).toBe(1);
  });

  it('should close when Backspace is pressed on an empty line', () => {
    let canceled = 0;
    component.cancel.subscribe(() => canceled++);

    component.text = '';
    press('Backspace');
    expect(canceled).toBe(1);

    // With text present, Backspace is ordinary editing and must not close.
    component.text = 'w';
    press('Backspace');
    expect(canceled).toBe(1);
  });

  it('should walk history newest-first with Up and back down with Down', () => {
    component.history = ['ls', 'w', 'e other.kidraw.yaml'];
    component.open();

    press('ArrowUp');
    expect(component.text).toBe('e other.kidraw.yaml');
    press('ArrowUp');
    expect(component.text).toBe('w');
    press('ArrowUp');
    expect(component.text).toBe('ls');

    // Already at the oldest entry: stay put rather than wrapping.
    press('ArrowUp');
    expect(component.text).toBe('ls');

    press('ArrowDown');
    expect(component.text).toBe('w');
    press('ArrowDown');
    expect(component.text).toBe('e other.kidraw.yaml');
    press('ArrowDown');
    expect(component.text).toBe('');
  });

  it('should do nothing on Up with no history', () => {
    component.history = [];
    component.open();

    press('ArrowUp');

    expect(component.text).toBe('');
  });
});
