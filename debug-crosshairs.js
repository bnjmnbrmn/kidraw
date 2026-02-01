const puppeteer = require('puppeteer');

async function debugCrosshairs() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Navigate to the app
  await page.goto('http://localhost:4200');
  
  // Wait for the app to load
  await page.waitForSelector('canvas', { timeout: 10000 });
  
  console.log('=== Testing crosshairs positioning ===');
  
  // Get initial crosshairs position
  const initialPos = await page.evaluate(() => {
    const appElement = document.querySelector('app-drawing-area');
    const component = window.ng.getComponent(appElement);
    
    return {
      crosshairsX: component.crosshairsLayer.crosshairsX(),
      crosshairsY: component.crosshairsLayer.crosshairsY(),
      crosshairsGroupX: component.crosshairsLayer.crosshairs.x,
      crosshairsGroupY: component.crosshairsLayer.crosshairs.y,
      crosshairsAbsolutePos: component.crosshairsLayer.crosshairs.getAbsolutePosition()
    };
  });
  
  console.log('Initial crosshairs position:', initialPos);
  
  // Create a new node
  await page.evaluate(() => {
    const appElement = document.querySelector('app-drawing-area');
    const component = window.ng.getComponent(appElement);
    component.createNewNode();
  });
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get position after creating node
  const afterCreatePos = await page.evaluate(() => {
    const appElement = document.querySelector('app-drawing-area');
    const component = window.ng.getComponent(appElement);
    
    return {
      crosshairsX: component.crosshairsLayer.crosshairsX(),
      crosshairsY: component.crosshairsLayer.crosshairsY(),
      crosshairsGroupX: component.crosshairsLayer.crosshairs.x,
      crosshairsGroupY: component.crosshairsLayer.crosshairs.y
    };
  });
  
  console.log('Position after creating node:', afterCreatePos);
  
  // Simulate pressing 'i' to create node and enter label edit mode
  await page.keyboard.press('i');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get position in label edit mode
  const inLabelEditPos = await page.evaluate(() => {
    const appElement = document.querySelector('app-drawing-area');
    const component = window.ng.getComponent(appElement);
    
    return {
      crosshairsX: component.crosshairsLayer.crosshairsX(),
      crosshairsY: component.crosshairsLayer.crosshairsY(),
      crosshairsGroupX: component.crosshairsLayer.crosshairs.x,
      crosshairsGroupY: component.crosshairsLayer.crosshairs.y
    };
  });
  
  console.log('Position in label edit mode:', inLabelEditPos);
  
  // Press Enter to exit label edit mode
  await page.keyboard.press('Enter');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get position after exiting label edit mode
  const afterExitPos = await page.evaluate(() => {
    const appElement = document.querySelector('app-drawing-area');
    const component = window.ng.getComponent(appElement);
    
    return {
      crosshairsX: component.crosshairsLayer.crosshairsX(),
      crosshairsY: component.crosshairsLayer.crosshairsY(),
      crosshairsGroupX: component.crosshairsLayer.crosshairs.x,
      crosshairsGroupY: component.crosshairsLayer.crosshairs.y
    };
  });
  
  console.log('Position after exiting label edit mode:', afterExitPos);
  
  await browser.close();
}

debugCrosshairs().catch(console.error);
