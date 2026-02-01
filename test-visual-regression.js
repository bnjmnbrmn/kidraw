const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const pixelmatch = require('pixelmatch');

class VisualRegressionTester {
  constructor() {
    this.baselineDir = path.join(__dirname, 'test-baselines');
    this.outputDir = path.join(__dirname, 'test-output');
    this.diffDir = path.join(__dirname, 'test-diffs');
    
    // Create directories
    [this.baselineDir, this.outputDir, this.diffDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async runTests() {
    console.log('🎯 Starting Visual Regression Tests...\n');
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--window-size=800x600']
    });
    
    try {
      const page = await browser.newPage();
      
      // Test scenarios
      const tests = [
        { name: 'initial-state', url: 'http://localhost:4200' },
        { name: 'demo-data', url: 'http://localhost:4200?demo=true' },
        { name: 'crosshairs-moved', url: 'http://localhost:4200', action: 'move-crosshairs' },
        { name: 'node-created', url: 'http://localhost:4200', action: 'create-node' },
        { name: 'zoom-max', url: 'http://localhost:4200', action: 'zoom-max' },
        { name: 'zoom-min', url: 'http://localhost:4200', action: 'zoom-min' },
        { name: 'label-edit-mode', url: 'http://localhost:4200', action: 'label-edit' }
      ];
      
      let passed = 0;
      let failed = 0;
      let newBaselines = 0;
      
      for (const test of tests) {
        try {
          const result = await this.runTest(page, test);
          if (result.status === 'passed') passed++;
          else if (result.status === 'failed') failed++;
          else if (result.status === 'new-baseline') newBaselines++;
          
          console.log(`${result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '📸'} ${test.name}: ${result.message}`);
        } catch (error) {
          console.log(`❌ ${test.name}: ${error.message}`);
          failed++;
        }
      }
      
      console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${newBaselines} new baselines`);
      
      if (failed > 0) {
        console.log('\n🔍 Check test-diffs/ directory for visual differences');
      }
      
    } finally {
      await browser.close();
    }
  }

  async runTest(page, test) {
    // Navigate to test URL
    await page.goto(test.url);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Perform action if specified
    if (test.action) {
      await this.performAction(page, test.action);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Take screenshot
    const screenshot = await page.screenshot({ fullPage: true });
    const outputPath = path.join(this.outputDir, `${test.name}.png`);
    fs.writeFileSync(outputPath, screenshot);
    
    // Check if baseline exists
    const baselinePath = path.join(this.baselineDir, `${test.name}.png`);
    
    if (!fs.existsSync(baselinePath)) {
      // Create new baseline
      fs.writeFileSync(baselinePath, screenshot);
      return { status: 'new-baseline', message: 'Created new baseline' };
    }
    
    // Compare with baseline
    const baseline = fs.readFileSync(baselinePath);
    
    if (screenshot.equals(baseline)) {
      return { status: 'passed', message: 'Matches baseline' };
    }
    
    // Generate diff
    const diff = this.generateDiff(baseline, screenshot);
    const diffPath = path.join(this.diffDir, `${test.name}-diff.png`);
    fs.writeFileSync(diffPath, diff);
    
    // Calculate difference percentage
    const diffPercentage = this.calculateDiffPercentage(baseline, screenshot);
    
    return { 
      status: 'failed', 
      message: `Differs by ${diffPercentage.toFixed(2)}%`,
      diffPath,
      diffPercentage
    };
  }

  async performAction(page, action) {
    switch (action) {
      case 'move-crosshairs':
        await page.keyboard.press('l');
        await page.keyboard.press('l');
        await page.keyboard.press('j');
        await page.keyboard.press('j');
        break;
        
      case 'create-node':
        await page.keyboard.press('i');
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.keyboard.press('Escape'); // Exit label edit
        break;
        
      case 'zoom-max':
        await page.keyboard.press('z');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('i');
        break;
        
      case 'zoom-min':
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('z');
          await new Promise(resolve => setTimeout(resolve, 200));
          await page.keyboard.press('o');
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        break;
        
      case 'label-edit':
        await page.keyboard.press('i');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.type('Test Label');
        break;
    }
  }

  generateDiff(img1, img2) {
    const { width, height } = require('pngjs').PNG.sync.read(img1);
    const diff = new (require('pngjs').PNG)({ width, height });
    
    const numDiffPixels = pixelmatch(
      img1, img2,
      diff.data,
      width, height,
      { threshold: 0.1 }
    );
    
    return require('pngjs').PNG.sync.write(diff);
  }

  calculateDiffPercentage(img1, img2) {
    const { width, height } = require('pngjs').PNG.sync.read(img1);
    const totalPixels = width * height;
    
    const diff = new Uint8Array(totalPixels * 4);
    const numDiffPixels = pixelmatch(
      img1, img2,
      diff,
      width, height,
      { threshold: 0.1 }
    );
    
    return (numDiffPixels / totalPixels) * 100;
  }
}

// Run the tests
const tester = new VisualRegressionTester();
tester.runTests().catch(console.error);
