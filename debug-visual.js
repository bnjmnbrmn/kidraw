const puppeteer = require('puppeteer');

async function debugVisualIssues() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Navigate to the app
  await page.goto('http://localhost:4200');
  
  // Wait for the app to load
  await page.waitForSelector('canvas', { timeout: 10000 });
  
  console.log('=== Taking screenshot of current state ===');
  await page.screenshot({ path: 'debug-current-state.png', fullPage: true });
  
  // Try to access Angular component through console
  const debugInfo = await page.evaluate(() => {
    // Try to find the drawing area component
    const appElement = document.querySelector('app-drawing-area');
    if (!appElement) {
      return { error: 'Could not find app-drawing-area element' };
    }
    
    // Try to get component instance (this might not work due to Angular encapsulation)
    const component = ng.getComponent(appElement);
    if (!component) {
      return { error: 'Could not access component instance' };
    }
    
    return {
      hasDrawingLayer: !!component.drawingLayer,
      hasCrosshairsLayer: !!component.crosshairsLayer,
      drawingLayerNodes: component.drawingLayer ? component.drawingLayer['daNodes']?.length || 0 : 0,
      drawingLayerEdges: component.drawingLayer ? component.drawingLayer['daEdges']?.length || 0 : 0
    };
  });
  
  console.log('Debug info:', debugInfo);
  
  // Take a screenshot focused on the canvas area
  const canvasElement = await page.$('canvas');
  if (canvasElement) {
    await canvasElement.screenshot({ path: 'debug-canvas-closeup.png' });
    console.log('Canvas closeup saved');
  }
  
  await browser.close();
}

debugVisualIssues().catch(console.error);
