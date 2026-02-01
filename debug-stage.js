const puppeteer = require('puppeteer');

async function debugStage() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Navigate to the app
  await page.goto('http://localhost:4200');
  
  // Wait for the app to load
  await page.waitForSelector('canvas', { timeout: 10000 });
  
  console.log('=== Checking stage dimensions ===');
  
  const stageInfo = await page.evaluate(() => {
    const appElement = document.querySelector('app-drawing-area');
    const component = window.ng.getComponent(appElement);
    
    return {
      stageWidth: component.stage.width(),
      stageHeight: component.stage.height(),
      expectedCrosshairsX: component.stage.width() / 2,
      expectedCrosshairsY: component.stage.height() / 2,
      actualCrosshairsX: component.crosshairsLayer.crosshairsX(),
      actualCrosshairsY: component.crosshairsLayer.crosshairsY(),
      crosshairsGroupX: component.crosshairsLayer.crosshairs.x,
      crosshairsGroupY: component.crosshairsLayer.crosshairs.y
    };
  });
  
  console.log('Stage info:', stageInfo);
  
  await browser.close();
}

debugStage().catch(console.error);
