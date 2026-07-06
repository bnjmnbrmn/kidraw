---
title: Vault model — FSA directory grant behind a storage interface
type: decision
---

# Vault model — FSA directory grant behind a storage interface

**Decision (2026-07-06).** kidraw's file storage is a *vault*: a single directory
the user grants once via `showDirectoryPicker()` (Chromium File System Access
API). The handle is persisted in IndexedDB and re-used across sessions. Every
file operation after the grant is programmatic — no native dialog appears in
any open/save/create flow. All access goes through a `Vault` interface so the
local FSA vault is implementation #1 and a cloud workspace can be
implementation #2 later.

## Why

This unblocks dogfooding (kidraw as the project's own todo graph):

1. **Auto-save without ceremony.** Debounced silent writes to the open file;
   "saving" stops being a user action.
2. **The LLM round-trip.** The vault is a real directory on disk. An LLM (or
   any external tool) edits `*.kidraw.yaml` directly; kidraw notices and
   reloads. No backend needed.
3. **Keyboard-driven file UX.** The OS picker cannot be keyboard-menu-ified
   (FSA security model requires native chrome). But it only has to appear
   *once* — to grant the vault. After that, the planned trad/large-menu
   fuzzy-finder (see `../docs/command-surface-plan.md`) operates on the
   vault listing entirely in keyboard land: type-to-filter over existing
   files, type a fresh name + Enter to create.

## The `Vault` interface

Everything above this seam (menus, auto-save, conflict policy, LLM polling)
must not know which implementation it's on:

- `list()` — recursive listing of `*.kidraw.*` / `*.kd-style.*` (paths relative to vault root)
- `read(path)` / `write(path, content)` — write creates parents/file as needed
- `delete(path)`, `exists(path)`
- `lastModified(path)` — cheap; used for external-change polling
- `isConnected()` / `connect()` — grant or re-grant flow

Implementations: **LocalFsaVault** (now), **CloudVault** (later — HTTP + auth
behind the same interface; this is the monetization layer, deliberately not
built until there are users).

## Auto-save

When the open graph is vault-backed, mutations schedule a debounced write
(~1 s after last change, same trigger family as the localStorage draft
writer). The localStorage draft remains crash-recovery only, per
`../docs/serialization-plan.md`.

## External changes: polling + conflict policy

FSA has no file-watching; poll `lastModified` on the open file (~1–2 s,
timestamp only — no read).

- **Changed on disk, session clean** → silent reload + status message
  ("Reloaded — changed on disk").
- **Changed on disk, session dirty** → local state wins; warning status. No
  merge attempt. (Blunt by design; revisit only if dogfooding actually hits
  it.)

## Caveats accepted knowingly

- **Chromium-only.** Firefox/Safari keep the Phase-4 download-blob path.
  Acceptable for dogfooding and for an eventual desktop wrap.
- **Browser restart** may cost one "continue allowing?" click before the
  handle works again (persistent permissions usually avoid even that).
- Chrome refuses grants on system directories — vault is somewhere like
  `~/kidraw/`.

## Cloud workspaces (deferred, shape agreed)

Single-user cloud vault = remote storage behind the same interface — easy.
*Shared* workspaces fork into async sharing (file-level, feasible; the
semantic/style YAML split diffs well) vs. real-time collaboration (CRDTs,
presence — a large program, stays last in post-MVP). Async-shared first when
the time comes.

## Open questions

- Keymenu sub-root design for the overlay menu (mode-hierarchy addition;
  check invariants I1–I3 in
  [architecture-keymenu-model](architecture-keymenu-model.md)).
- Poll interval / backoff when tab is hidden.
- Rename/delete UX (menu actions vs. deferred to external tools).
