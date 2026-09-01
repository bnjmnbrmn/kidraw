# kidraw.net — the introduction page

One page, no framework, no build dependencies. `index.html` is the source; it
is written as page content only (no `<!doctype>`, `<html>` or `<head>`) so the
same file can be previewed as a Claude artifact and shipped as the site.

```bash
npm run site:build       # → site/dist/index.html, with the head a real site needs
npm run site:test        # build + document, desktop-keyboard, and mobile-tap smoke tests
```

Serve `site/dist/` as the document root for **kidraw.net**. The app itself
lives at **alpha.kidraw.net**, which every call to action here points at.

The source's `site-head` block is kept usable in a Claude artifact, then moved
into the real document head by the build. The screenshot is inlined as a data URI, so `dist/index.html` is
the only file that needs to be served — nothing else to copy, nothing to break
if a path changes. To refresh it, take a new screenshot of the running app,
base64 it, and replace the `src="data:image/png;base64,…"` value.

The hero demo is a small self-contained script: `hjkl` moves the crosshair,
`a` adds a connected node and enters label editing, `x` removes one, `Esc`
leaves editing. It mirrors the real app's mode model on purpose — it is the
argument the page is making — but it is not the real editor and says so.
