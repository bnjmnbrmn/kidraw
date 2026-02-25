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
