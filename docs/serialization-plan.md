# KiDraw Serialization & I/O Plan

_Started 2026-05-16. Companion to [`file-format.md`](file-format.md) — the format spec; this is the implementation plan._

## Locked-in decisions (2026-05-16)

- **YAML default** for new files (`.kidraw.yaml`, `.kd-style.yaml`). JSON is fully supported; users pick at save time via the file extension.
- **Inline styles permitted** alongside external file references (see [`file-format.md`](file-format.md) → *Inline style sets*).
- **First save of a brand-new graph** prompts for both a graph-doc location and an initial style-set location in a single flow.
- **Silent migration** of any existing `kidraw_graph_v1` localStorage payload to the new v2 draft schema on first load.
- **Open and Import are both supported.** Open replaces the session; Import adds a style set to the current graph.

---

## Storage layers

| Layer | What lives there | When written | When read |
|-------|------------------|--------------|-----------|
| In-memory | live `DrawingLayer` state | always (source of truth) | always |
| `localStorage["kidraw_draft_v2"]` | last-known graph + active style snapshot | debounced after every mutating command | cold start, when no file is being opened |
| Files on disk | `.kidraw.{json,yaml}` graph docs + `.kd-style.{json,yaml}` style sets | explicit Save / Save As / Export | Open + style-resolver |
| `.kidraw.zip` | self-contained bundle of graph + transitively-referenced styles | Export → Zip | Open (transparent unpack) |

The localStorage draft is **crash recovery only** — it never overrides a file currently open. On cold start, if the draft contains a file reference and the file can be re-opened via a stored FSA handle, kidraw re-opens the file. If not, it offers "Resume unsaved graph" or "Discard and start fresh."

`kidraw_graph_v1` (current single-slot save) is read once on first load, migrated into the v2 draft, then deleted.

---

## Session state model

```
SessionState {
  graph:           Graph                          # in-memory
  fileHandle?:     FileSystemFileHandle           # Chromium only
  filePath?:       string                         # display name + path memory
  styleHandles:    Map<resolvedPath, Handle>      # one per loaded external style
  activeStyleId:   string                         # external path or inline name
  dirty:           boolean                        # unsaved changes vs. file
  zipBacking?:     ArrayBuffer                    # when loaded from .kidraw.zip
}
```

The header surfaces:
- `filePath` (middle-truncated, e.g. `~/.../auth.kidraw.yaml`)
- Active display chip (clickable to switch; also `m → d` keymenu route)
- Dirty indicator (`●` glyph beside filename when `dirty`)
- "Unsaved" badge when no file is open yet

---

## Save model

- **Explicit-save semantics for files.** Mutations set `dirty = true`; nothing is written to disk until the user invokes Save.
- **Continuous-autosave for the localStorage draft.** Every mutating command schedules a debounced (~1.5s) write to `kidraw_draft_v2`. Independent of file dirty state; purely for crash recovery.
- **`beforeunload` prompt** when `dirty` and a file is open.
- **No prompt** when only the localStorage draft has changes — those are caught by the cold-start "Resume" flow.

---

## Command surface

Replaces the current `m → s/l/n` localStorage commands. All under the `m` (menu) submenu:

| Keys | Action | Notes |
|------|--------|-------|
| `m → s` | **Save** | Writes to backing file. Falls through to Save As if no backing file. |
| `m → a` | **Save As** | Prompts for location; becomes the new backing file. |
| `m → o` | **Open** | File picker (`.kidraw.{json,yaml,zip}`). Replaces session. |
| `m → i` | **Import style set** | Add a `.kd-style.{json,yaml}` to the current graph's `styles[]`. |
| `m → e → z` | Export zip bundle | Pack graph + transitive styles into `.kidraw.zip`. |
| `m → e → i / v / p` | Export PNG / SVG / PDF | *Separate effort; listed for command-surface completeness.* |
| `m → n` | New graph | Prompt if dirty. (Existing behavior.) |
| `m → d → 1..N` | Switch active display | Number maps to entry in `styles[]` (1-indexed). |
| `m → d → c` | Create new display | Snapshot current visual state into a new style set. |

Key-assignment note: shifted variants of submenu keys aren't currently in the keymenu framework, so Save / Save As use distinct unshifted keys (`s` / `a`) rather than `s` / `S`.

---

## First-save flow (brand-new graph, never saved)

A single user gesture (`m → s` on a never-saved graph) opens a two-step prompt:

1. **Save graph document as…** — file picker, default extension `.kidraw.yaml`, default basename `untitled.kidraw.yaml`.
2. **Save initial style as…** — file picker, default extension `.kd-style.yaml`, default basename a sibling of the graph (`untitled.kd-style.yaml`).

After both succeed:
- The graph doc references the style as `styles: ["./<style-filename>"]`.
- Both files are written.
- `fileHandle`, `filePath`, `styleHandles`, `activeStyleId` populated. `dirty = false`.

Alternative single-shot: `m → e → z` (Export Zip) bundles everything into one `.kidraw.zip` without separate prompts. Useful when "I just want one file" is the priority.

---

## Open vs Import

- **Open** (`m → o`) — replaces the current session. Picks a `.kidraw.{json,yaml,zip}`. Loads the graph doc, walks `styles[]`, resolves each external reference (FSA → zip → prompt-on-miss). Sets `fileHandle` to the picked file.
- **Import style set** (`m → i`) — current session stays. Picks a `.kd-style.{json,yaml}`. Appends the file's path to the current graph's `styles[]`. Doesn't switch active display (use `m → d` for that).

Import is the lightweight way to layer a new theme / layout / A-B variant on top of an existing graph without losing your place.

---

## Style-file resolution

Tiered fallback for resolving a relative path from a graph doc or style set:

1. **In-session cache** — if a path was already resolved this session, reuse the handle / content.
2. **File System Access API sibling lookup** — Chromium only; requires directory access granted by the user. Auto-resolves siblings of the graph doc.
3. **Zip-internal lookup** — when loaded from `.kidraw.zip`, resolve from the unpacked archive.
4. **Prompt-on-miss modal** — "Can't find `theme-dark.kd-style.yaml`. Locate it?" with a file picker. Cache the resolution.

If the user cancels a prompt-on-miss, the entry is marked unavailable for the session. Switching to it via `m → d` shows a "Can't load — file missing" state instead of silently failing.

---

## localStorage migration (v1 → v2)

On cold start:
1. If `kidraw_draft_v2` exists, load it.
2. Else if `kidraw_graph_v1` exists, parse the v1 snapshot, wrap it as a v2 draft (`{ graph: ..., filePath: null, dirty: true }`), write `kidraw_draft_v2`, delete `kidraw_graph_v1`. One-time toast: "Restored your previous graph."
3. Else, start fresh.

v1→v2 treats the old single-slot save as "an unsaved graph with no file backing." The user must explicitly Save / Save As to put it on disk.

---

## Format choice on write

- New graph defaults to `.kidraw.yaml`. User overrides in the file picker.
- Save (existing file) writes back in the same format it was loaded from (extension preserved).
- Save As uses the extension the user picks. Conversion JSON↔YAML is a free side-effect.

YAML library: `js-yaml` (3-clause BSD, well-maintained). Round-trip property: load → save → reload produces structurally identical data (modulo formatting / comments — v1 doesn't preserve comments).

---

## Implementation phases

1. **Format primitives.** TypeScript types matching the format spec (graph doc, style set, inline-or-path entries). Pure-function parser/serializer for JSON + YAML. Round-trip tests on sample files.
2. **In-memory mapping.** `DrawingLayer` → `semantics`; live visual state → `.kd-style` body. Reverse: apply parsed style to the layer. Element-level resolver after cascade.
3. **localStorage v2 + v1 migration.** New draft schema, debounced writer, cold-start reader, migration code.
4. **Open / Save As (basic).** Plain `<input type=file>` and download-blob path that works in Firefox + Safari. First user-visible win.
5. **Vault (FSA directory grant).** One `showDirectoryPicker()` call grants kidraw a working directory — the *vault* (Obsidian sense). The `FileSystemDirectoryHandle` is persisted in IndexedDB; Chromium's persistent permissions make re-grant on restart a no-op or one click. After the grant there is **no native dialog in any flow**: the app lists, reads, creates, and writes files in the vault programmatically, which is what makes a keyboard-driven file menu possible. All storage access goes through a `Vault` interface (list / read / write / create / delete / lastModified) so a cloud workspace can slot in later as a second implementation. Includes: silent debounced auto-save to the open file, `lastModified` polling to pick up external edits (the LLM round-trip), and the conflict policy (external change + clean session → silent reload with status message; dirty session → local wins, warn). Per-file `showOpenFilePicker` / `showSaveFilePicker` remain only as an out-of-vault escape hatch. Chromium-only; other browsers keep the Phase-4 blob path. Full rationale: `notes/decision-vault-model.md`.
6. **Cascade + resolver.** Import-graph walk with cycle detection. Element-specific-over-tagStyle rule. Inline-style handling.
7. **Display switching UI.** Header chip + `m → d` keymenu submenu.
8. **Prompt-on-miss modal.** Standalone Angular component; cache resolutions per session.
9. **Zip bundle export.** `fflate` (smaller than jszip) for `.kidraw.zip`. Walk import graph, collect all referenced files, pack with directory layout intact.
10. **Polish.** Dirty indicator glyph, `beforeunload` prompt, malformed-file error UX, Import-style command, "Create new display" snapshot command.

Phases 1–3 are foundation; 4 is the first user-visible win; 5–9 add real-world ergonomics; 10 is finish.

---

## Open questions / future

- **Schema validation.** Validate against a JSON Schema (e.g. `ajv`) on load, or trust the structure and crash on bad data? Better error messages vs. extra dependency.
- **Default graph basename.** `untitled` is fine for v1; could derive from the first node's label or a heuristic later.
- **Multi-document workspace.** "Recent files" list, side panel of open documents. Not v1.
- **Cloud sync.** Out of scope here, but the handle abstraction should leave room for a future cloud-handle type.
- **Style-property linter.** Warn if a style sets `fill` on an edge (no effect) or `lineStyle` on a node. Nice to have.
- **Markdown in `description`.** Open question from the format doc; doesn't block this work.
