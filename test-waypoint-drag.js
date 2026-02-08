const puppeteer = require('puppeteer');

async function testWaypointDragging() {
  console.log('🧪 Testing waypoint dragging functionality...');
  
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: ['--window-size=800x600']
  });

  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:4200');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create two nodes
    console.log('Creating nodes...');
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.press('Escape');
    
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.press('Escape');
    
    // Connect them
    console.log('Connecting nodes...');
    await page.keyboard.press('h');
    await page.keyboard.press('h');
    await page.keyboard.press('h');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('s');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('c');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Move crosshairs to the middle of the edge
    console.log('Moving crosshairs to edge center...');
    await page.keyboard.press('h');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Add waypoint
    console.log('Adding waypoint...');
    await page.keyboard.press('w');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Show waypoints with s key
    console.log('Showing waypoints with s key...');
    await page.keyboard.down('s');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Select waypoint (move crosshairs to waypoint and select)
    console.log('Selecting waypoint...');
    await page.keyboard.up('s');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.down('s');
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.press('s'); // Select waypoint
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.up('s');
    
    // Test dragging the waypoint
    console.log('Dragging waypoint right...');
    await page.keyboard.down('r');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 300));
    await page.keyboard.up('r');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('Dragging waypoint down...');
    await page.keyboard.down('r');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('j');
    await new Promise(resolve => setTimeout(resolve, 300));
    await page.keyboard.up('r');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('Dragging waypoint left...');
    await page.keyboard.down('r');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('h');
    await new Promise(resolve => setTimeout(resolve, 300));
    await page.keyboard.up('r');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('Dragging waypoint up...');
    await page.keyboard.down('r');
    await new Promise(resolve => setTimeout(resolve, 100));
    await page.keyboard.press('k');
    await new Promise(resolve => setTimeout(resolve, 300));
    await page.keyboard.up('r');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('\n✅ Waypoint dragging test complete! Press Enter to close browser...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } finally {
    await browser.close();
  }
}

testWaypointDragging().catch(console.error);
