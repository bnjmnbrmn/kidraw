import {VISIBLE_KEYS, isVisibleKey, xAndYForKeys, KEY_HEIGHT, KEY_MARGIN} from './positions';
import {KeyString} from './keyString';

/** The card draws only the three letter rows (2026-08-28). The keys it stops
 *  drawing must keep working — Ctrl still opens its submenu, CapsLock still
 *  switches mode, Space still holds — so they keep positions and only lose
 *  their cards. */
describe('keymenu visible key set', () => {
  it('draws exactly the three letter rows', () => {
    expect(VISIBLE_KEYS.length).toBe(30);
    expect(VISIBLE_KEYS).toContain('q');
    expect(VISIBLE_KEYS).toContain(';');
    expect(VISIBLE_KEYS).toContain('/');
  });

  it('does not draw the outer keys', () => {
    for (const k of ['Control','RControl','CapsLock','Enter','Shift','RShift',
                     'Tab','[',']','\\',' ','Alt','1','`','Backspace',"'"] as KeyString[]) {
      expect(isVisibleKey(k)).withContext(k).toBe(false);
    }
  });

  it('still gives the hidden keys a position, so key construction works', () => {
    for (const k of ['Control','CapsLock',' ','Enter'] as KeyString[]) {
      expect(xAndYForKeys[k]).withContext(k).toBeDefined();
    }
  });

  it('parks hidden keys off the card rather than overlapping it', () => {
    for (const k of ['Control','CapsLock',' '] as KeyString[]) {
      expect(xAndYForKeys[k].x).withContext(k).toBeLessThan(0);
      expect(xAndYForKeys[k].y).withContext(k).toBeLessThan(0);
    }
  });

  it('lays the three rows out on consecutive lines with a keyboard stagger', () => {
    const rowY = (k: KeyString) => xAndYForKeys[k].y;
    expect(rowY('q')).toBe(0);
    expect(rowY('a')).toBe(KEY_HEIGHT + KEY_MARGIN);
    expect(rowY('z')).toBe(2 * (KEY_HEIGHT + KEY_MARGIN));
    // Each row starts progressively further right, as on a real keyboard.
    expect(xAndYForKeys['q'].x).toBeLessThan(xAndYForKeys['a'].x);
    expect(xAndYForKeys['a'].x).toBeLessThan(xAndYForKeys['z'].x);
  });
});
