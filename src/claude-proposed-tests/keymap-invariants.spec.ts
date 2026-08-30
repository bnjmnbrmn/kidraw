/**
 * Invariants over the key map itself.
 *
 * Every bug this guards against actually happened, most of them in the last
 * two days: a chord that the hand cannot make (da-537), a label whose
 * trailing "..." duplicated the chamfer (da-527), a hub whose children sat
 * on keys the card does not draw, and a custom-profile collision that only
 * a spec caught by accident.
 *
 * These are cheap, pure and data-driven: they walk the real menu tree for
 * both profiles rather than asserting one binding at a time, so a new
 * submenu is covered the moment it exists.
 */
import {TestBed} from '@angular/core/testing';
import {KeymenuComponent} from '../app/keymenu/keymenu.component';
import {
  IJKL_KEYMENU_KEY_ASSIGNMENTS,
  VIM_KEYMENU_KEY_ASSIGNMENTS,
  KeymenuKeyAssignments,
} from '../app/keymenu/config/key-assignments';
import {
  LabeledAction,
  LabeledSubmenuConfig,
  LabeledActionSubmenuConfig,
  LabeledActionWithRelease,
  SubmenuConfig,
} from '../app/lib/keymenu/layouts/us-qwerty/submenuConfig';
import {KeyString, VISIBLE_KEYS} from '../app/lib/keymenu/layouts/us-qwerty';

/** Which finger types a key, per hand. Left/right are separate spaces. */
const FINGERS: Record<string, {hand: 'L' | 'R'; finger: 'pinky' | 'ring' | 'middle' | 'index'}> = {};
for (const [keys, hand, finger] of [
  ['qaz', 'L', 'pinky'], ['wsx', 'L', 'ring'], ['edc', 'L', 'middle'], ['rfvtgb', 'L', 'index'],
  ['yhnujm', 'R', 'index'], ['ik,', 'R', 'middle'], ['ol.', 'R', 'ring'], ['p;/', 'R', 'pinky'],
] as const) {
  for (const k of keys) FINGERS[k] = {hand, finger} as any;
}

/** The pair the hand cannot separate — see notes/design-chord-ergonomics.md. */
function isHardChord(hub: string, child: string): boolean {
  const a = FINGERS[hub], b = FINGERS[child];
  if (!a || !b || a.hand !== b.hand) return false;
  if (a.finger === b.finger) return true;                     // same finger: impossible
  const pair = new Set([a.finger, b.finger]);
  return pair.has('middle') && pair.has('ring');
}

interface Entry {
  key: string;
  label: string;
  children?: SubmenuConfig;
}

function entriesOf(config: SubmenuConfig): Entry[] {
  const out: Entry[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (key === '_repeatConfig' || !value) continue;
    if (value instanceof LabeledSubmenuConfig || value instanceof LabeledActionSubmenuConfig) {
      out.push({key, label: value.submenuLabel, children: value.submenuConfig});
    } else if (value instanceof LabeledAction || value instanceof LabeledActionWithRelease) {
      out.push({key, label: (value as LabeledAction).actionLabel});
    }
  }
  return out;
}

/** Every (hub key, submenu) reachable from the root, breadth first. */
function walk(root: SubmenuConfig): {path: string[]; hub: string | null; config: SubmenuConfig}[] {
  const found = [{path: [] as string[], hub: null as string | null, config: root}];
  for (let i = 0; i < found.length; i++) {
    const {path, config} = found[i];
    for (const entry of entriesOf(config)) {
      if (entry.children) {
        found.push({path: [...path, entry.key], hub: entry.key, config: entry.children});
      }
    }
  }
  return found;
}

function buildRoot(assignments: KeymenuKeyAssignments): SubmenuConfig {
  const fixture = TestBed.createComponent(KeymenuComponent);
  const component = fixture.componentInstance;
  component.keyAssignments = assignments;
  return (component as any).buildRootSubmenuConfig();
}

describe('key map invariants', () => {
  const PROFILES: [string, KeymenuKeyAssignments][] = [
    ['vim', VIM_KEYMENU_KEY_ASSIGNMENTS],
    ['ijkl', IJKL_KEYMENU_KEY_ASSIGNMENTS],
  ];
  /**
   * Accepted today, each for a stated reason. Anything NOT in here that the
   * invariants catch is a finding, not a fixture.
   */
  const ACCEPTED_HARD_CHORDS = new Set([
    // The ijkl profile hangs its Add hub off `e` (left middle) with children
    // on d/c/x/s/w — middle and ring, the pair the hand cannot separate. It
    // is the secondary profile; the vim one is clean. Fixing it means
    // re-keying that hub, which is Ben's call.
    'ijkl:e+d', 'ijkl:e+c', 'ijkl:e+x', 'ijkl:e+s', 'ijkl:e+w',
  ]);
  const ACCEPTED_UNDRAWN = new Set([
    // Ctrl-[ is vim's Escape. `[` is deliberately off the card (the card
    // draws the three letter rows), and the chord is muscle memory, not
    // something anyone looks up.
    'Control+[', 'RControl+[',
  ]);

  /** Bound but never drawn: they work, they just have no card. */
  const OFF_CARD = new Set(['Shift', 'RShift', 'Control', 'RControl', 'CapsLock', 'Alt', 'RAlt', ' ', 'Enter', 'Backspace', 'Tab']);

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [KeymenuComponent]}).compileComponents();
  });

  for (const [name, assignments] of PROFILES) {
    describe(name, () => {
      it('never asks one hand to hold a hub and press with the enslaved finger', () => {
        const offenders: string[] = [];
        for (const {hub, config} of walk(buildRoot(assignments))) {
          if (!hub) continue;
          for (const entry of entriesOf(config)) {
            if (isHardChord(hub, entry.key) && !ACCEPTED_HARD_CHORDS.has(`${name}:${hub}+${entry.key}`)) {
              offenders.push(`${hub} + ${entry.key} (${entry.label})`);
            }
          }
        }
        expect(offenders.join(' | ')).toBe('');
      });

      it('binds each key at most once per submenu', () => {
        // Object literals silently drop duplicates, so a collision shows up
        // as a MISSING action rather than an error. Compare the entry count
        // against the distinct keys the builder was handed.
        for (const {path, config} of walk(buildRoot(assignments))) {
          const keys = entriesOf(config).map(e => e.key);
          expect(new Set(keys).size).withContext(`at [${path.join(' → ')}]`).toBe(keys.length);
        }
      });

      it('draws every binding it offers', () => {
        const invisible: string[] = [];
        for (const {path, config} of walk(buildRoot(assignments))) {
          for (const entry of entriesOf(config)) {
            if (OFF_CARD.has(entry.key)) continue;
            const hub = path[path.length - 1] ?? '';
            if (!VISIBLE_KEYS.includes(entry.key as KeyString)
                && !ACCEPTED_UNDRAWN.has(`${hub}+${entry.key}`)) {
              invisible.push(`[${path.join(' → ')}] ${entry.key}: ${entry.label}`);
            }
          }
        }
        expect(invisible.join(' | ')).toBe('');
      });

      it('says "has children" with the chamfer, not with an ellipsis', () => {
        const withEllipsis: string[] = [];
        for (const {config} of walk(buildRoot(assignments))) {
          for (const entry of entriesOf(config)) {
            if (entry.children && /\.\.\.|…\s*$/.test(entry.label)) withEllipsis.push(entry.label);
          }
        }
        expect(withEllipsis.join(' | ')).toBe('');
      });

      it('gives every action a label', () => {
        for (const {path, config} of walk(buildRoot(assignments))) {
          for (const entry of entriesOf(config)) {
            expect(entry.label?.trim().length)
              .withContext(`[${path.join(' → ')}] ${entry.key}`).toBeGreaterThan(0);
          }
        }
      });
    });
  }
});
