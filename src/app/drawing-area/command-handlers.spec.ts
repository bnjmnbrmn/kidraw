import {DACommandType} from './command.model';
import {CommandHandlers, CommandSlice, mergeCommandSlices, runCommand} from './command-handlers';
import {DrawingAreaComponent} from './drawing-area.component';

describe('command handler slices', () => {
  it('joins slices from different owners into one table', () => {
    const zoomIn = jasmine.createSpy('zoomIn');
    const undo = jasmine.createSpy('undo');
    const table = mergeCommandSlices(
      {[DACommandType.ZOOM_IN]: zoomIn} satisfies CommandSlice,
      {[DACommandType.UNDO]: undo} satisfies CommandSlice,
    );
    expect(table[DACommandType.ZOOM_IN]).toBe(zoomIn);
    expect(table[DACommandType.UNDO]).toBe(undo);
  });

  it('refuses two slices claiming the same command', () => {
    const claim = {[DACommandType.ZOOM_IN]: () => undefined} satisfies CommandSlice;
    expect(() => mergeCommandSlices(claim, {...claim})).toThrowError(/ZOOM_IN/);
  });

  it('runs the handler for the command it is given, with its payload', () => {
    const insertChar = jasmine.createSpy('insertChar');
    const handlers = {[DACommandType.INSERT_CHAR]: insertChar} as Partial<CommandHandlers> as CommandHandlers;
    runCommand(handlers, {kind: DACommandType.INSERT_CHAR, value: 'x'});
    expect(insertChar).toHaveBeenCalledOnceWith({kind: DACommandType.INSERT_CHAR, value: 'x'});
  });

  // The compiler checks every command kind has a handler; only the runtime can
  // check that no two of the drawing area's owners claim the same one.
  it("gives each of the drawing area's commands exactly one owner", () => {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    const handlers = component.commandHandlers as CommandHandlers;
    expect(Object.values(handlers).every(handler => typeof handler === 'function')).toBeTrue();
  });
});
