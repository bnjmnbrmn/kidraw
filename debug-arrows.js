const puppeteer = require('puppeteer');

async function debugArrowIssues() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Navigate to the app
  await page.goto('http://localhost:4200');
  
  // Wait for the app to load
  await page.waitForSelector('canvas', { timeout: 10000 });
  
  console.log('=== Loading demo data ===');
  
  // Try to trigger demo data loading (look for a button or method)
  const demoDataLoaded = await page.evaluate(() => {
    // Try to find and click a demo data button if it exists
    const demoButton = document.querySelector('button');
    if (demoButton && demoButton.textContent.includes('demo')) {
      demoButton.click();
      return true;
    }
    
    // Try to access the demo data service directly
    if (window.ng && window.ng.getComponent) {
      const appElement = document.querySelector('app-root');
      const appComponent = window.ng.getComponent(appElement);
      
      // Look for demo data service or method to load data
      if (appComponent && appComponent.loadDemoData) {
        appComponent.loadDemoData();
        return true;
      }
    }
    
    return false;
  });
  
  console.log('Demo data loaded:', demoDataLoaded);
  
  // Wait a bit for data to load
  await page.waitForTimeout(2000);
  
  // Take screenshot after loading demo data
  await page.screenshot({ path: 'debug-with-demo-data.png', fullPage: true });
  
  // Get detailed info about nodes and edges
  const detailedInfo = await page.evaluate(() => {
    const appElement = document.querySelector('app-drawing-area');
    if (!appElement) return { error: 'No drawing area found' };
    
    const component = window.ng.getComponent(appElement);
    if (!component || !component.drawingLayer) {
      return { error: 'No drawing layer found' };
    }
    
    const drawingLayer = component.drawingLayer;
    const nodes = drawingLayer['daNodes'] || [];
    const edges = drawingLayer['daEdges'] || [];
    
    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes: nodes.map((node, i) => ({
        index: i,
        x: node.group ? node.group.x() : 'no-group',
        y: node.group ? node.group.y() : 'no-group',
        width: node.NODE_WIDTH,
        height: node.NODE_HEIGHT,
        hasGroup: !!node.group,
        groupPosition: node.group ? node.group.position() : 'no-position'
      })),
      edges: edges.map((edge, i) => ({
        index: i,
        hasLine: !!edge.line,
        hasGroup: !!edge.group,
        linePoints: edge.line ? edge.line.points() : 'no-points',
        groupPosition: edge.group ? edge.group.position() : 'no-position'
      }))
    };
  });
  
  console.log('Detailed info:', JSON.stringify(detailedInfo, null, 2));
  
  await browser.close();
}

debugArrowIssues().catch(console.error);
