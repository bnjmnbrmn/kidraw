const puppeteer = require('puppeteer');

async function testArrowhead() {
  console.log('🧪 Testing arrowhead visibility with waypoints...');
  
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
    
    console.log('Edge created - check if arrowhead is visible at destination node');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
    
    console.log('Waypoint added - check if arrowhead is still visible at destination node');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n✅ Arrowhead test complete! Press Enter to close browser...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } finally {
    await browser.close();
  }
}

testArrowhead().catch(console.error);
