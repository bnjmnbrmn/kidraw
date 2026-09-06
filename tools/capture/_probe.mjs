import {open, keys} from './driver.mjs';
import {seed, goTo, fitToText, mode, settle} from './build.mjs';
const {browser, page} = await open({width: 820, height: 700, scale: 1});
const sel = () => page.evaluate(() =>
  window.ng.getComponent(document.querySelector('app-drawing-area')).drawingLayer.getSelectedDANodes().length);
await seed(page, 'KiDraw');
await goTo(page, 'KiDraw');
console.log('mode before fit:', await mode(page), '| selected', await sel());
await fitToText(page);
console.log('mode after fit:', await mode(page), '| selected', await sel());
await goTo(page,'KiDraw'); await keys(page, 'v'); await settle(page, 350);
console.log('after v:', await mode(page), '| selected', await sel());
await keys(page, 'Escape'); await settle(page, 300);
await keys(page, 'v'); await settle(page, 350);
console.log('after Escape+v:', await mode(page), '| selected', await sel());
await browser.close();
