import Konva from 'konva';
import {KeyMenu} from './keyMenu';
import {KeyMenuMode} from './keyMenuMode';
import {KeyMenuModeConfig} from './keyMenuModeConfig';
import {KeyMenuModeConfigs} from './keyMenuConfig';

class TestMode implements KeyMenuMode<void> {
  readonly konvaGroup = new Konva.Group();

  constructor(
    public readonly name: string,
    public readonly keyMenu: KeyMenu<void>,
  ) {}

  handleKeyDown(): void {
    // no-op
  }

  handleKeyUp(): void {
    // no-op
  }

  beforeSwitchOut(): void {
    // no-op
  }

  beforeSwitchIn(): void {
    // no-op
  }
}

class TestModeConfig implements KeyMenuModeConfig<void, TestMode> {
  createMode(name: string, keyMenu: KeyMenu<void>): TestMode {
    return new TestMode(name, keyMenu);
  }
}

describe('KeyMenu', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it('should start in the configured initial mode when provided', () => {
    const keyMenu = buildKeyMenu({
      initialModeName: 'secondary',
      modes: {
        primary: new TestModeConfig(),
        secondary: new TestModeConfig(),
      },
    });

    expect(keyMenu.currentMode.name).toBe('secondary');
  });

  it('should fall back to the first configured mode when initial mode is unknown', () => {
    const keyMenu = buildKeyMenu({
      initialModeName: 'missing' as 'primary',
      modes: {
        primary: new TestModeConfig(),
        secondary: new TestModeConfig(),
      },
    });

    expect(keyMenu.currentMode.name).toBe('primary');
  });

  it('should throw when created without any modes', () => {
    expect(() => buildKeyMenu({modes: {} as KeyMenuModeConfigs<void>})).toThrowError(
      'KeyMenu requires at least one mode configuration.',
    );
  });

  function buildKeyMenu(overrides: {
    modes: KeyMenuModeConfigs<void>;
    initialModeName?: string;
  }): KeyMenu<void> {
    const host = document.createElement('div');
    const container = document.createElement('div');
    const containerId = `key-menu-test-${Math.random().toString(36).slice(2, 10)}`;

    container.id = containerId;
    host.appendChild(container);

    Object.defineProperty(host, 'clientWidth', {value: 640, configurable: true});
    Object.defineProperty(host, 'clientHeight', {value: 320, configurable: true});

    document.body.appendChild(host);

    const keyMenu = new KeyMenu<void>({
      containerId,
      containingHTMLElement: host,
      modes: overrides.modes,
      initialModeName: overrides.initialModeName,
    });

    cleanups.push(() => {
      keyMenu.destroy();
      host.remove();
    });

    return keyMenu;
  }
});
