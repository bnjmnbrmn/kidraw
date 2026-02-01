const puppeteer = require('puppeteer');

async function debugDemoData() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Navigate to the app with demo parameter
  await page.goto('http://localhost:4200?demo=true');
  
  // Wait for the app to load
  await page.waitForSelector('canvas', { timeout: 10000 });
  
  // Wait for demo data to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('=== Taking screenshot with demo data ===');
  await page.screenshot({ path: 'debug-demo-data.png', fullPage: true });
  
  // Get info about the loaded demo data
  const demoInfo = await page.evaluate(() => {
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
        groupPosition: node.group ? node.group.position() : 'no-position'
      })),
      edges: edges.map((edge, i) => ({
        index: i,
        linePoints: edge.line ? edge.line.points() : 'no-points'
      }))
    };
  });
  
  console.log('Demo data info:', JSON.stringify(demoInfo, null, 2));
  
  await browser.close();
}

debugDemoData().catch(console.error);
