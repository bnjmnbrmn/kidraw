# KiDraw Graph File Format

_Started 2026-04-28. Updated 2026-05-16 with HTML/CSS-style model._

## Mental model

KiDraw uses an HTML/CSS-style split:

- **`*.kidraw.json` / `*.kidraw.yaml`** — the **graph document** (like HTML). Defines what the graph *is*: nodes, edges, tags, semantic relationships. Carries no positions or visual styling.
- **`*.kd-style.json` / `*.kd-style.yaml`** — a **style set** (like CSS). Defines presentation: where nodes sit, how they look, fonts, colors, viewport. May `imports` other style sets to compose themes and layouts.

A graph document references one or more style sets via relative paths. Each top-level reference is a **display** the user can switch between. **Only one top-level style is active at a time.** The active style — plus everything it transitively imports — composes via cascade into a single flattened presentation applied to the graph.

## Decisions

- **Both JSON and YAML** supported. Loader detects by extension (`.json` / `.yaml` / `.yml`).
- **IDs**: kebab-case slugs (`auth-service`, `auth-reads-users`). Auto-suggested from labels; user-overridable. One definition site per ID → Go-to-Definition + Find-References work in editors.
- **Directedness is semantic**: `undirected | directed | bidirectional` — lives in the graph document.
- **All visual styling lives in style sets** — colors, stroke widths, dash patterns, arrowheads, positions, sizes, fonts, viewport. The graph document is presentation-free.
- **Styles are referenced or inlined**: a `styles[]` entry in the graph document is either a relative path (external file) or an object (inline style set, with a required `name` field). See *Inline style sets* below.
- **Nodes and edges have three text fields** in the graph document:
  - `label` — short display name (shown on canvas)
  - `description` — longer detail (tooltip, side panel, export)
  - optionally `notes` (TBD — may fold into `description`)
- **Tags** — arrays of strings on nodes and edges, like CSS classes. Used for filtering, categorization, and as selectors in style sets.
- **Style cascade**:
  - Order = source order across the import graph (depth-first, later wins for the same selector).
  - Element-specific rules (by id) beat tag-style rules within a single file.
  - A top-level's own rules appear after its imports in the cascade, so it overrides what it imports.
- **Cycle detection**: import cycles are detected and rejected with an error.

## How style sets compose

A `.kd-style.json` file can declare:

1. `imports` — other style-set paths to pull in first (cascade base)
2. `tagStyles` — rules keyed by tag name, e.g. `{ backend: { fill: "#e8f0fe" } }`
3. `nodes` — per-element overrides keyed by node id, e.g. `{ "auth-service": { x: 100, y: 100, fill: "#fff" } }`
4. `edges` — per-element overrides keyed by edge id
5. `view` — viewport (zoom/pan) for this display

When the user selects a top-level style, the loader:

1. Walks the `imports` graph depth-first, detecting cycles.
2. Concatenates rules in source order.
3. Applies cascade: later rules override earlier for the same selector; element-specific beats tagStyles.
4. Returns a flat resolved style map.

## Inline style sets

A `styles[]` entry in the graph document can be either a relative path (string) or an inline style-set body (object). Inline entries must include a `name` field — used as the display's identifier in the UI, since there's no filename to derive one from.

```json
{
  "styles": [
    "./overview-light.kd-style.json",
    {
      "name": "quick-tweak",
      "imports": ["./theme-dark.kd-style.json"],
      "nodes": { "auth-service": { "fontSize": 18 } }
    }
  ]
}
```

Inline styles follow the same composition rules as external ones: they can `imports` other files, participate in the cascade, and act as top-level displays. They cannot be referenced from other files (no path to them).

**When to use which:**

- **External** — any style set worth naming, sharing, reusing across graphs, or versioning separately. The default choice.
- **Inline** — one-off tweaks, quick experiments, or when keeping the graph in a single portable file matters more than reusability.

## Naming convention

```
foo.kidraw.json              # graph document
foo.kidraw.yaml              # same, YAML
overview.kd-style.json       # a display (top-level or imported)
theme-dark.kd-style.json     # a shared theme (imported by displays)
base-layout.kd-style.json    # a shared layout (imported by displays)
```

The `.kidraw.` and `.kd-style.` double extensions identify the file type unambiguously and are easy to glob (`*.kd-style.*`). Top-level vs imported is not a property of the file — it's just whether the graph document points at it directly.

## Examples

### Light/dark toggle with shared layout

```
foo.kidraw.json
overview-light.kd-style.json   # top-level: imports [base-layout, theme-light]
overview-dark.kd-style.json    # top-level: imports [base-layout, theme-dark]
base-layout.kd-style.json
theme-light.kd-style.json
theme-dark.kd-style.json
```

User switches between `overview-light` and `overview-dark`. Positions stay, colors change. Layout work isn't duplicated.

### Two zoom levels of the same graph

```
overview.kd-style.json   # top-level: imports [compact-positions, small-fonts, theme]
detail.kd-style.json     # top-level: imports [expanded-positions, large-fonts, theme, show-descriptions]
```

Detail spreads nodes out further and surfaces description text; overview collapses back.

### Tag-based focus mode

```
full-view.kd-style.json      # top-level: imports [base-layout, theme]
backend-focus.kd-style.json  # top-level: imports [base-layout, theme, fade-frontend]
fade-frontend.kd-style.json  # tagStyles: { frontend: { opacity: 0.15 } }
```

`backend-focus` dims everything tagged `frontend` while keeping it visible for context.

### A/B comparison

```
arrangement-a.kd-style.json   # auth-service at x=100
arrangement-b.kd-style.json   # auth-service at x=600
```

Two top-levels with overlapping per-element overrides. Toggle to compare.

### Top-level extending another top-level

```
overview.kd-style.json           # imports [base-layout, theme]
overview-annotated.kd-style.json # imports [overview, callout-labels]
```

`overview-annotated` is "the overview, plus callouts." Top-levels are just style sets — no special status until selected.

## Format sketches

### Graph document — `foo.kidraw.json`

```json
{
  "kidraw": 1,
  "styles": [
    "./overview-light.kd-style.json",
    "./overview-dark.kd-style.json",
    "./detail.kd-style.json"
  ],
  "semantics": {
    "nodes": {
      "auth-service": {
        "label": "Auth Service",
        "description": "Handles OAuth2 flows and JWT issuance. Stateless; scales horizontally.",
        "tags": ["backend", "auth"]
      },
      "user-db": {
        "label": "User DB",
        "description": "Postgres. Primary store for user records and sessions.",
        "tags": ["backend", "storage", "critical"]
      }
    },
    "edges": {
      "auth-reads-users": {
        "from": "auth-service",
        "to": "user-db",
        "directed": "directed",
        "tags": ["read-path"],
        "labels": [{ "text": "SELECT *" }]
      }
    }
  }
}
```

The **first entry in `styles` is the default display** when the file is opened. No separate `defaultStyle` field — put your default first.

### Top-level style — `overview-light.kd-style.json`

```json
{
  "kdStyle": 1,
  "imports": [
    "./base-layout.kd-style.json",
    "./theme-light.kd-style.json"
  ],
  "tagStyles": {
    "critical":  { "stroke": "#d93025", "strokeWidth": 2 },
    "read-path": { "lineStyle": "dashed", "stroke": "#888" }
  },
  "nodes": {
    "auth-service": { "fontSize": 16 }
  },
  "edges": {
    "auth-reads-users": {
      "waypoints": [{ "x": 300, "y": 200 }],
      "labelOffsets": [{ "dx": 0, "dy": -12 }]
    }
  },
  "view": { "zoom": 1.0, "panX": 0, "panY": 0 }
}
```

### Shared layout — `base-layout.kd-style.json`

```json
{
  "kdStyle": 1,
  "nodes": {
    "auth-service": { "x": 100, "y": 100, "w": 120, "h": 60 },
    "user-db":      { "x": 400, "y": 100, "w": 120, "h": 60 }
  }
}
```

### Shared theme — `theme-light.kd-style.json`

```json
{
  "kdStyle": 1,
  "tagStyles": {
    "backend": { "fill": "#e8f0fe", "stroke": "#4a90e2" }
  }
}
```

### YAML equivalent

```yaml
kdStyle: 1
imports:
  - ./base-layout.kd-style.yaml
  - ./theme-light.kd-style.yaml
tagStyles:
  critical:  { stroke: "#d93025", strokeWidth: 2 }
  read-path: { lineStyle: dashed, stroke: "#888" }
nodes:
  auth-service: { fontSize: 16 }
view: { zoom: 1.0, panX: 0, panY: 0 }
```

## Path resolution & distribution

KiDraw runs in a browser, so cross-file references need help:

- **Prompt-on-miss.** When a referenced file isn't already loaded, prompt the user to locate it via the file picker. Cache the resolution within the session so a given missing path is only prompted once.
- **Zip bundle for distribution.** Wrap the graph document and all transitively-referenced style sets into a single `.kidraw.zip` for sharing. The bundle preserves the directory layout so relative paths resolve naturally on unpack.
- **File System Access API (Chromium, optional).** When available, kidraw can resolve sibling files automatically once the user grants directory access — no prompts needed for files in the same folder tree.

## Style properties — initial set

Node-applicable: `x`, `y`, `w`, `h`, `fill`, `stroke`, `strokeWidth`, `textColor`, `fontSize`, `shape` (`box` | `circle` | `diamond` | `junction`), `opacity`.

Edge-applicable: `stroke`, `strokeWidth`, `lineStyle` (`solid` | `dashed` | `dotted`), `waypoints`, `labelOffsets`, `opacity`.

Viewport (top-level styles only, ignored on imports): `zoom`, `panX`, `panY`.

Subject to expansion as needs arise.

## Open questions

- Should `description` support Markdown? Probably yes — renderer's choice.
- When a user creates a graph with no style set, do we auto-generate a starter `.kd-style.json` alongside, or render with built-in defaults until they explicitly save styling?
- How does the in-app UI represent "switching displays"? A dropdown of the `styles` array entries? A keymenu submenu? (Out of scope for the file format, but informs naming/ordering expectations.)
- Validation: should kidraw reject a graph document that references a style set whose IDs don't match the semantics, or just warn? (Style set might intentionally omit some elements.)
