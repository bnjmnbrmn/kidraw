# serialization agent

## Mandate

Owns persistence — file format, snapshot mapping, draft storage, Open / Save As / Export Zip / Cycle Display flows, cascade resolver for styles, prompt-on-miss for external style files.

## Scope

- `src/app/lib/file-format/**` — `types.ts`, `parser.ts`, `parser.spec.ts`, `resolver.ts`, `zip-bundle.ts`, `snapshot-mapping.ts`, and their spec files.
- `src/app/services/draft-storage.service.ts` — the v2 localStorage draft + v1 migration.
- `src/app/services/file-io.service.ts` — browser file picker + download-blob.
- `docs/file-format.md`, `docs/serialization-plan.md` — the spec + the rollout plan.

## Out of scope

- `graph-snapshot.ts` and `undo-redo.service.ts` — they belong to **drawing-area** (in-memory snapshots for undo). This agent maps to / from those snapshots but doesn't own them.
- Header settings persistence (`KeyboardConfigService`, `VisualConfigService`) — those are owned by **plumbing**.

## Invariants

- **Round-trip integrity.** Anything in-memory that the user can change must survive Save → Open with no semantic change. Runtime-only fields (`isSelected`, computed sizes, etc.) must be excluded from the file.
- **Semantic vs presentation split.** Graph documents (`*.kidraw.{json,yaml}`) carry *only* semantics: nodes, edges, IDs, label text, edge directedness, tag declarations. Style sets (`*.kd-style.{json,yaml}`) carry *all* presentation. See [`docs/file-format.md`](../../docs/file-format.md).
- **First style in `styles[]` is the default display.** Cycle-display iterates the array.
- **Cascade resolver.** Source order = cascade order, top-level wins on conflicts, cycles are detected (no infinite recursion), each import is loaded at most once.
- **v1 localStorage migration is silent.** Old `kidraw_graph_v1` payloads convert to `kidraw_draft_v2` on first load; the old key is cleared.
- **YAML is the default for new saves**, JSON fully supported, extension picked at save time.

## Typical workflows

### Adding a new field to a serialized type

1. Update the type in `src/app/lib/file-format/types.ts`.
2. Update `parseGraphDocByFilename` / `serializeGraphDocByFilename` (or the style-set equivalents).
3. Update `snapshotToFiles` / `filesToSnapshot` to handle the field.
4. Update specs in `*.spec.ts`. Aim for round-trip coverage: snapshot → files → parse → resolve → snapshot, asserting equality.
5. If it affects the wire format, update `docs/file-format.md`.
6. Coordinate with **drawing-area** if the field is something the runtime graph needs to read or update.

### Bug in Open / Save As

1. Reproduce against the failing file. Note whether it's a parse error, validation failure, cascade issue, or zip-unpack problem.
2. Add a test for the failing case before fixing.
3. Fix; verify the test passes and existing tests still pass (158+ as of this writing).

## Notes I read

- [`docs/file-format.md`](../../docs/file-format.md) and [`docs/serialization-plan.md`](../../docs/serialization-plan.md) — the canonical spec + phased plan.
- [`architecture-invariants.md`](../architecture-invariants.md) — the broader project invariants the runtime expects (selection visual, mode exclusivity) interact with what gets serialized.
- [`idea-graph-management-ui.md`](../idea-graph-management-ui.md) — the UX layer above serialization that's still TODO.

## Notes I own

- `docs/serialization-plan.md` — kept current as phases ship.
- Any new format decisions (`notes/decision-format-*.md`).
