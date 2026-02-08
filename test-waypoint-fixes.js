const puppeteer = require('puppeteer');

async function testWaypointFixes() {
  console.log('🧪 Testing waypoint fixes...');
  
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 25,
    args: ['--window-size=800x600']
  });

  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:4200');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 250));
    
    const getDebugInfo = async () => {
      return await page.evaluate(() => {
        const appElement = document.querySelector('app-drawing-area');
        const component = window.ng.getComponent(appElement);
        
        const nodes = component.drawingLayer['daNodes'] || [];
        const edges = component.drawingLayer.getDAEdges();
        
        return {
          nodesCount: nodes.length,
          edgesCount: edges.length,
          edgesWithWaypoints: edges.map(edge => ({
            waypointsCount: edge.waypoints ? edge.waypoints.length : 0,
            segmentsCount: edge._segments ? edge._segments.length : 0
          }))
        };
      });
    };
    
    // Create two nodes
    console.log('Creating nodes...');
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 125));
    await page.keyboard.press('Escape');
    
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 75));
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 125));
    await page.keyboard.press('Escape');
    
    // Connect them
    console.log('Connecting nodes...');
    await page.keyboard.press('h');
    await page.keyboard.press('h');
    await page.keyboard.press('h');
    await new Promise(resolve => setTimeout(resolve, 75));
    await page.keyboard.press('s');
    await new Promise(resolve => setTimeout(resolve, 75));
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 75));
    await page.keyboard.press('c');
    await new Promise(resolve => setTimeout(resolve, 125));
    
    let info = await getDebugInfo();
    console.log('Before waypoint:');
    console.log('Nodes:', info.nodesCount);
    console.log('Edges:', info.edgesCount);
    console.log('Waypoints per edge:', info.edgesWithWaypoints);
    console.log('Segments per edge:', info.edgesWithWaypoints);
    
    // Move crosshairs to the middle of the edge
    console.log('Moving crosshairs to edge center...');
    await page.keyboard.press('h');
    await new Promise(resolve => setTimeout(resolve, 75));
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 75));
    
    // Add waypoint
    console.log('Adding waypoint...');
    await page.keyboard.press('w');
    await new Promise(resolve => setTimeout(resolve, 125));
    
    info = await getDebugInfo();
    console.log('After waypoint:');
    console.log('Nodes:', info.nodesCount);
    console.log('Edges:', info.edgesCount);
    console.log('Waypoints per edge:', info.edgesWithWaypoints);
    console.log('Segments per edge:', info.edgesWithWaypoints);
    
    const hasWaypoint = info.edgesWithWaypoints.some(edge => edge.waypointsCount > 0);
    const hasSegments = info.edgesWithWaypoints.some(edge => edge.segmentsCount > 0);
    console.log(`Waypoint created: ${hasWaypoint}`);
    console.log(`Edge segments created: ${hasSegments}`);
    
    // Test waypoint visibility with s key
    console.log('Testing waypoint visibility with s key...');
    await page.keyboard.down('s');
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('s key pressed - waypoints should be visible');
    await page.keyboard.up('s');
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('s key released - waypoints should be hidden');
    
    // Test waypoint visibility with v key
    console.log('Testing waypoint visibility with v key...');
    await page.keyboard.down('v');
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('v key pressed - waypoints should be visible');
    await page.keyboard.up('v');
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('v key released - waypoints should be hidden');
    
    console.log('\n✅ Waypoint fixes test complete! Press Enter to close browser...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } finally {
    await browser.close();
  }
}

testWaypointFixes().catch(console.error);
