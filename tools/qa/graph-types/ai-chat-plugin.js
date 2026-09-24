/*
 * AI Chat as a plugin (Ben, 2026-09-23: "an AI chat plugin (encapsulated the
 * AI work that we've already done)"), switched in Settings > Plugins.
 *
 * Off: `m` and `o` leave the keymenu, Shift's O and M with them; pressing `m`
 * opens nothing; an agent command that still arrives says the chat is off.
 * On again: the keys come back.
 */
const {launch, openApp, settled, checker, DA} = require('../harness.js');

const check = checker();
const KM = "window.ng.getComponent(document.querySelector('app-keymenu'))";
const APP = "window.ng.getComponent(document.querySelector('app-root'))";
const km = (page, expr) => page.evaluate(`(() => { const km = ${KM}; return ${expr}; })()`);
const statusText = page => page.evaluate(() => document.querySelector('.status-message')?.textContent ?? '');
const rootLabels = page => km(page, `(cfg => ({m: cfg['m']?.actionLabel ?? null, o: cfg['o']?.actionLabel ?? null}))(km.buildRootSubmenuConfig())`);
const panelOpen = page => page.evaluate(`${APP}.agent.panelOpen()`);

async function toggleAiChat(page) {
  await page.click('.settings-dropdown > summary');
  if (!(await page.$eval('.plugins-section', el => el.open))) await page.click('.plugins-section > summary');
  await page.click('input[data-plugin="agent-chat"]');
  await page.click('.settings-dropdown > summary');
  await settled(page);
}

(async () => {
  const browser = await launch();
  const page = await openApp(browser);
  await page.evaluate(() => localStorage.removeItem('kidraw-plugins-disabled'));
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForSelector('#mainDrawingArea canvas');
  await settled(page);

  const on = await rootLabels(page);
  check('with AI Chat on, m and o are the chat keys', on.m === 'Agent Chat' && on.o === 'Ask Agent', JSON.stringify(on));

  await toggleAiChat(page);
  check('turning it off says so', (await statusText(page)) === 'AI Chat: off', await statusText(page));
  const off = await rootLabels(page);
  check('its keys leave the keymenu', off.m === null && off.o === null, JSON.stringify(off));
  check('Shift no longer offers Follow or Close', await km(page,
    `!Object.values(km.buildNormalShiftSubmenuConfig()).some(v => v?.actionLabel === 'Follow Agent' || v?.actionLabel === 'Close Chat')`));

  await page.keyboard.press('m');
  await settled(page);
  check('pressing m opens nothing', !(await panelOpen(page)));

  await page.evaluate(`(() => { ${KM}.keyMenuOut.emit({kind: 'OPEN_AGENT_CHAT'});
    window.ng.applyChanges(${APP}); })()`);
  await settled(page);
  check('an agent command that still arrives says the chat is off',
    (await statusText(page)) === 'AI Chat is turned off in Settings', await statusText(page));
  check('and opens nothing', !(await panelOpen(page)));

  await toggleAiChat(page);
  check('turning it back on says so', (await statusText(page)) === 'AI Chat: on', await statusText(page));
  const back = await rootLabels(page);
  check('and the keys are back', back.m === 'Agent Chat' && back.o === 'Ask Agent', JSON.stringify(back));

  await page.evaluate(() => localStorage.removeItem('kidraw-plugins-disabled'));
  console.log(`\n${check.failures} failure(s)`);
  await check.exit(browser);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
