/** Shared bits for the /shots/ gallery generators (layout-gallery.js,
 *  next-typed-viz.js): the page style and the root run index. */
const fs = require('fs');
const path = require('path');

/** Dark gallery page CSS. Portrait/desktop: responsive thumbnail grid.
 *  Phone landscape (short viewport): one diagram per screen, snap-scrolled,
 *  so flicking moves between single full-size shots. */
const GALLERY_CSS = `
  body{font-family:system-ui;margin:12px;background:#181a1f;color:#ddd}
  h1{font-size:22px}
  h2{border-bottom:2px solid #444;padding-bottom:4px}
  h3{margin:14px 0 6px;color:#bbb}
  code{color:#9cf}
  .row{display:flex;flex-wrap:wrap;gap:8px}
  figure{margin:0;flex:1 1 300px;max-width:480px}
  img{width:100%;border:1px solid #444;border-radius:4px}
  figcaption{font-size:12px;color:#999;text-align:center}
  @media (orientation: landscape) and (max-height: 620px) {
    html{scroll-snap-type:y mandatory}
    body{margin:0 8px}
    .row{display:block}
    figure{
      max-width:none;width:100%;min-height:100vh;box-sizing:border-box;
      scroll-snap-align:center;scroll-snap-stop:always;
      display:flex;flex-direction:column;justify-content:center;
    }
    figure img{max-height:88vh;width:auto;max-width:100%;object-fit:contain;margin:0 auto}
    figcaption{font-size:14px;padding:4px 0}
  }
`;

function pageHtml(title, headline, meta, sectionsHtml) {
  return `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${GALLERY_CSS}</style>
<h1>${headline}</h1>
<p>${meta}</p>
${sectionsHtml}`;
}

/** Regenerate the root index listing all run directories, newest first. */
function writeRootIndex(outRoot) {
  const runs = fs.readdirSync(outRoot, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort().reverse();
  fs.writeFileSync(path.join(outRoot, 'index.html'), `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>kidraw layout galleries</title>
<style>body{font-family:system-ui;margin:16px;background:#181a1f;color:#ddd}
a{color:#9cf} li{margin:6px 0;font-size:18px}</style>
<h1>kidraw layout galleries</h1>
<ul>${runs.map(r => `<li><a href="${r}/">${r}</a></li>`).join('')}</ul>`);
}

module.exports = { GALLERY_CSS, pageHtml, writeRootIndex };
