import {KeyMenu} from '../keyMenu';
import {USQwertyModeConfig, USQwertyMode} from './us-qwerty';
import {
  LabeledAction,
  LabeledSubmenuConfig,
  SubmenuConfig,
} from '../layouts/us-qwerty/submenuConfig';

describe('USQwertyMode', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  describe('repeater lifetime on out-of-order release (\\m \\x /m /x)', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    function buildRepeatMenu(counter: { count: number }): KeyMenu<void> {
      return buildKeyMenu({
        _repeatConfig: {initialDelayMs: 100, intervalMs: 50},
        h: new LabeledAction('Move', () => counter.count++),
        s: new LabeledSubmenuConfig('Coarse...', {
          h: new LabeledAction('Coarse Move', () => {}),
        }),
      } as SubmenuConfig);
    }

    it('keeps the parent repeater running while a child submenu is open (I3)', () => {
      const counter = {count: 0};
      const keyMenu = buildRepeatMenu(counter);

      keyMenu.handleKeyDown(new KeyboardEvent('keydown', {key: 'h'}));
      expect(counter.count).toBe(1);
      keyMenu.handleKeyDown(new KeyboardEvent('keydown', {key: 's'}));
      jasmine.clock().tick(200);
      expect(counter.count).toBeGreaterThan(1);
    });

    it('stops the parent repeater on its key-up even while a child submenu is open', () => {
      const counter = {count: 0};
      const keyMenu = buildRepeatMenu(counter);

      keyMenu.handleKeyDown(new KeyboardEvent('keydown', {key: 'h'}));
      keyMenu.handleKeyDown(new KeyboardEvent('keydown', {key: 's'}));
      keyMenu.handleKeyUp(new KeyboardEvent('keyup', {key: 'h'}));

      const after = counter.count;
      jasmine.clock().tick(1000);
      expect(counter.count).toBe(after);

      keyMenu.handleKeyUp(new KeyboardEvent('keyup', {key: 's'}));
      jasmine.clock().tick(1000);
      expect(counter.count).toBe(after);
    });

    it('leaves no scheduled timer in any stacked submenu after all keys are up', () => {
      const counter = {count: 0};
      const keyMenu = buildRepeatMenu(counter);

      keyMenu.handleKeyDown(new KeyboardEvent('keydown', {key: 'h'}));
      keyMenu.handleKeyDown(new KeyboardEvent('keydown', {key: 's'}));
      keyMenu.handleKeyUp(new KeyboardEvent('keyup', {key: 'h'}));
      keyMenu.handleKeyUp(new KeyboardEvent('keyup', {key: 's'}));

      const mode = keyMenu.currentMode as USQwertyMode<void>;
      const scheduled = mode.stack.flatMap((s) => [...s.scheduledActions.keys()]);
      expect(scheduled).toEqual([]);
    });
  });

  it('should pop submenu path when releasing a submenu key that is reused in the child submenu', () => {
    const keyMenu = buildKeyMenu({
      a: new LabeledSubmenuConfig('Insert...', {
        a: new LabeledAction('Conflicting action', () => {
          // no-op
        }),
      }),
    });

    keyMenu.handleKeyDown(new KeyboardEvent('keydown', {key: 'a'}));
    const modeAfterOpen = keyMenu.currentMode as USQwertyMode<void>;
    expect(modeAfterOpen.submenuKeyStringStack).toEqual(['', 'a']);

    keyMenu.handleKeyUp(new KeyboardEvent('keyup', {key: 'a'}));

    const modeAfterRelease = keyMenu.currentMode as USQwertyMode<void>;
    expect(modeAfterRelease.submenuKeyStringStack).toEqual(['']);
    expect(modeAfterRelease.stack.length).toBe(1);
  });

  function buildKeyMenu(rootSubmenuConfig: SubmenuConfig): KeyMenu<void> {
    const host = document.createElement('div');
    const container = document.createElement('div');
    const containerId = `us-qwerty-mode-test-${Math.random().toString(36).slice(2, 10)}`;

    container.id = containerId;
    host.appendChild(container);

    Object.defineProperty(host, 'clientWidth', {value: 640, configurable: true});
    Object.defineProperty(host, 'clientHeight', {value: 320, configurable: true});

    document.body.appendChild(host);

    const keyMenu = new KeyMenu<void>({
      containerId,
      containingHTMLElement: host,
      initialModeName: 'normal',
      modes: {
        normal: new USQwertyModeConfig(rootSubmenuConfig),
      },
    });

    cleanups.push(() => {
      keyMenu.destroy();
      host.remove();
    });

    return keyMenu;
  }
});
