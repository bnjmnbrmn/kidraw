const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class E2EWorkflowTester {
  constructor() {
    this.outputDir = path.join(__dirname, 'test-e2e-output');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async runTests(testFilter = null) {
    console.log('🔄 Starting E2E Workflow Tests...\n');

    const browser = await puppeteer.launch({
      headless: false, // Show browser for debugging
      slowMo: 100,
      args: ['--window-size=800x600']
    });

    try {
      const page = await browser.newPage();

      // Test workflows
      const workflows = [
        { name: 'Complete Node Creation Workflow', test: 'nodeCreationWorkflow' },
        { name: 'Complex Graph Creation', test: 'complexGraphWorkflow' },
        { name: 'Zoom and Pan Workflow', test: 'zoomPanWorkflow' },
        { name: 'Zoom Submenu Close on Release', test: 'zoomSubmenuCloseWorkflow' },
        { name: 'Selection and Editing Workflow', test: 'selectionWorkflow' },
        { name: 'Label Edit Mode Transitions', test: 'labelEditWorkflow' },
        { name: 'Edge Creation Workflow', test: 'edgeCreationWorkflow' },
        { name: 'Stress Test - Many Nodes', test: 'stressTestWorkflow' },
        { name: 'Keyboard Navigation Workflow', test: 'keyboardWorkflow' }
      ];

      // Filter tests if requested
      let testsToRun = workflows;
      if (testFilter !== null) {
        // Check if filter is a number (test index)
        const testIndex = parseInt(testFilter);
        if (!isNaN(testIndex) && testIndex >= 1 && testIndex <= workflows.length) {
          testsToRun = [workflows[testIndex - 1]];
          console.log(`Running test ${testIndex}: ${testsToRun[0].name}\n`);
        } else {
          // Try to match by name
          testsToRun = workflows.filter(w =>
            w.name.toLowerCase().includes(testFilter.toLowerCase()) ||
            w.test.toLowerCase().includes(testFilter.toLowerCase())
          );
          if (testsToRun.length === 0) {
            console.log(`❌ No tests found matching "${testFilter}"`);
            console.log('\nAvailable tests:');
            workflows.forEach((w, i) => console.log(`  ${i + 1}. ${w.name}`));
            return;
          }
          console.log(`Running ${testsToRun.length} test(s) matching "${testFilter}"\n`);
        }
      }

      let passed = 0;
      let failed = 0;

      for (const workflow of testsToRun) {
        try {
          console.log(`🧪 Running: ${workflow.name}`);
          const result = await this[workflow.test](page);
          
          if (result.passed) {
            passed++;
            console.log(`✅ ${workflow.name}: ${result.message}\n`);
          } else {
            failed++;
            console.log(`❌ ${workflow.name}: ${result.message}\n`);
            
            // Take screenshot on failure
            const screenshotPath = path.join(this.outputDir, `failed-${workflow.name.replace(/\s+/g, '-').toLowerCase()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 Screenshot saved: ${screenshotPath}`);
          }
        } catch (error) {
          failed++;
          console.log(`❌ ${workflow.name}: ${error.message}\n`);
        }
      }
      
      console.log(`📊 E2E Results: ${passed} passed, ${failed} failed`);
      
      if (failed > 0) {
        console.log('\n🔍 Check test-e2e-output/ directory for failure screenshots');
      }
      
    } finally {
      await browser.close();
    }
  }

  async nodeCreationWorkflow(page) {
    await page.goto('http://localhost:4200');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get initial state
    const initialState = await this.getComponentState(page);
    
    // Create node at current crosshairs position
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Add some text
    await page.keyboard.type('Test Node');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Exit label edit mode
    await page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Verify node was created
    const afterState = await this.getComponentState(page);
    
    if (afterState.nodeCount !== initialState.nodeCount + 1) {
      return { passed: false, message: 'Node count did not increase' };
    }
    
    // Verify node position is centered on crosshairs
    const crosshairsPos = await this.getCrosshairsPosition(page);
    const lastNode = afterState.nodes[afterState.nodes.length - 1];
    
    const expectedX = crosshairsPos.x - (lastNode.width / 2);
    const expectedY = crosshairsPos.y - (lastNode.height / 2);
    
    if (Math.abs(lastNode.x - expectedX) > 5 || Math.abs(lastNode.y - expectedY) > 5) {
      return { passed: false, message: 'Node not centered on crosshairs' };
    }
    
    return { passed: true, message: 'Node created and positioned correctly' };
  }

  async complexGraphWorkflow(page) {
    await page.goto('http://localhost:4200?demo=true');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const state = await this.getComponentState(page);
    
    // Should have demo data
    if (state.nodeCount < 5) {
      return { passed: false, message: 'Demo data not loaded' };
    }
    
    // Verify edge connections
    if (state.edgeCount < 5) {
      return { passed: false, message: 'Demo edges not created' };
    }
    
    // Verify arrow calculations (edge-to-edge connections)
    for (const edge of state.edges) {
      if (!edge.linePoints || edge.linePoints.length !== 4) {
        return { passed: false, message: 'Invalid edge line points' };
      }
      
      // Check that arrows connect edge-to-edge (not center-to-center)
      // For horizontal edges, Y should be at center, X should be at edges
      const [x1, y1, x2, y2] = edge.linePoints;
      
      // For the demo data, we know the expected values:
      // Edge 0: Node 0 (100,100) to Node 1 (300,100) should be [200,150,300,150]
      // Edge 1: Node 1 (300,100) to Node 2 (500,100) should be [400,150,500,150]
      // etc.
      
      // Verify it's not going through centers (which would be [150,150,350,150] for Edge 0)
      if (Math.abs(x1 - 150) < 10 && Math.abs(y1 - 150) < 10) {
        return { passed: false, message: 'Arrow appears to go through source center' };
      }
      
      if (Math.abs(x2 - 350) < 10 && Math.abs(y2 - 150) < 10) {
        return { passed: false, message: 'Arrow appears to go through destination center' };
      }
    }
    
    return { passed: true, message: 'Complex graph loaded correctly' };
  }

  async zoomPanWorkflow(page) {
    await page.goto('http://localhost:4200?demo=true');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get initial scale
    const initialScale = await this.getScale(page);
    if (Math.abs(initialScale - 1.0) > 0.1) {
      return { passed: false, message: 'Initial scale not 1.0' };
    }
    
    // Zoom in
    await page.keyboard.press('z'); // Open zoom submenu
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.press('i'); // Zoom in
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const zoomedInScale = await this.getScale(page);
    if (Math.abs(zoomedInScale - 2.0) > 0.1) {
      return { passed: false, message: 'Zoom in not working' };
    }
    
    // Zoom out
    await page.keyboard.press('z'); // Open zoom submenu
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.press('o'); // Zoom out
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const zoomedOutScale = await this.getScale(page);
    if (Math.abs(zoomedOutScale - 1.0) > 0.1) {
      return { passed: false, message: 'Zoom out not working' };
    }
    
    // Test coordinate transformations during zoom
    const crosshairsPos = await this.getCrosshairsPosition(page);
    
    // Create node while zoomed
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.keyboard.press('Escape');
    
    const nodeState = await this.getComponentState(page);
    const lastNode = nodeState.nodes[nodeState.nodes.length - 1];
    
    // Node should still be centered correctly despite zoom
    const expectedX = crosshairsPos.x - (lastNode.width / 2);
    const expectedY = crosshairsPos.y - (lastNode.height / 2);
    
    if (Math.abs(lastNode.x - expectedX) > 10 || Math.abs(lastNode.y - expectedY) > 10) {
      return { passed: false, message: 'Node positioning incorrect during zoom' };
    }
    
    return { passed: true, message: 'Zoom and coordinate transformations working' };
  }

  async zoomSubmenuCloseWorkflow(page) {
    await page.goto('http://localhost:4200');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get reference to key menu to check submenu state
    const getSubmenuInfo = async () => {
      return await page.evaluate(() => {
        const keyMenuElement = document.querySelector('app-keymenu');
        if (!keyMenuElement) return { found: false, reason: 'No keymenu element' };

        // Access the Angular component
        const component = window.ng.getComponent(keyMenuElement);
        if (!component) return { found: false, reason: 'No component instance' };

        const keyMenu = component.keyMenu;
        if (!keyMenu) return { found: false, reason: 'No keyMenu property' };

        const stage = keyMenu.stage;
        if (!stage) return { found: false, reason: 'No Konva stage' };

        // Collect all visible text labels (checking parent visibility too)
        const allTexts = stage.find('Text');
        const visibleLabels = [];
        let hasZoomSubmenu = false;

        for (let i = 0; i < allTexts.length; i++) {
          const text = allTexts[i];
          const content = text.text();
          // Check if text itself and all its ancestors are visible
          const isVisible = text.isVisible();

          if (isVisible && content && content.trim()) {
            visibleLabels.push(content);

            // Check for zoom submenu specific labels
            if (content === '...In' || content === '...Out') {
              hasZoomSubmenu = true;
            }
          }
        }

        return {
          found: hasZoomSubmenu,
          visibleLabels: visibleLabels,
          textCount: allTexts.length
        };
      });
    };

    // Initially, submenu should not be visible
    let info = await getSubmenuInfo();

    if (info.found) {
      return { passed: false, message: 'Zoom submenu visible before pressing z' };
    }

    // Press 'z' to open zoom submenu (but don't release yet)
    await page.keyboard.down('z');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Submenu should now be visible
    info = await getSubmenuInfo();

    if (!info.found) {
      return {
        passed: false,
        message: `Zoom submenu not visible after pressing z. ${info.reason || ''} Found labels: ${info.visibleLabels ? info.visibleLabels.join(', ') : 'none'}`
      };
    }

    // Release 'z' - submenu should close
    await page.keyboard.up('z');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Submenu should no longer be visible
    info = await getSubmenuInfo();

    if (info.found) {
      return { passed: false, message: 'Zoom submenu still visible after releasing z' };
    }

    return { passed: true, message: 'Zoom submenu closes correctly on key release' };
  }

  async selectionWorkflow(page) {
    await page.goto('http://localhost:4200?demo=true');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Move crosshairs to first node
    await page.keyboard.press('h');
    await page.keyboard.press('h');
    await page.keyboard.press('k');
    await page.keyboard.press('k');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Select node using 's' key
    await page.keyboard.press('s');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify selection
    const state = await this.getComponentState(page);
    const selectedNodes = state.nodes.filter(node => node.selected);

    if (selectedNodes.length === 0) {
      return { passed: false, message: 'No nodes selected' };
    }

    // Unselect all using Escape
    await page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 300));

    const stateAfterUnselect = await this.getComponentState(page);
    const selectedNodesAfter = stateAfterUnselect.nodes.filter(node => node.selected);

    if (selectedNodesAfter.length > 0) {
      return { passed: false, message: 'Nodes not unselected' };
    }

    return { passed: true, message: 'Selection workflow working' };
  }

  async labelEditWorkflow(page) {
    await page.goto('http://localhost:4200');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create node and enter label edit mode
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Type some text including movement keys (should be inserted, not move)
    await page.keyboard.type('hello');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Capture position before exiting
    const posBeforeExit = await this.getCrosshairsPosition(page);

    // Exit label edit mode with ESC
    await page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Position should not have changed yet
    const posAfterExit = await this.getCrosshairsPosition(page);

    if (Math.abs(posAfterExit.x - posBeforeExit.x) > 1 || Math.abs(posAfterExit.y - posBeforeExit.y) > 1) {
      return { passed: false, message: 'Crosshairs moved when exiting label edit mode with ESC' };
    }

    // Now test that movement keys work in normal mode
    await page.keyboard.press('h');
    await new Promise(resolve => setTimeout(resolve, 300));

    const posAfterMove = await this.getCrosshairsPosition(page);

    if (posAfterMove.x >= posAfterExit.x) {
      return { passed: false, message: `Movement key did not work after exiting label edit. Before: ${posAfterExit.x}, After: ${posAfterMove.x}` };
    }

    return { passed: true, message: 'Label edit mode transitions working' };
  }

  async edgeCreationWorkflow(page) {
    await page.goto('http://localhost:4200');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create first node
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.keyboard.press('Escape');
    
    // Move crosshairs
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Create second node
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.keyboard.press('Escape');
    
    // Select both nodes
    await page.keyboard.press('u'); // Unselect first
    await page.keyboard.press('h'); // Move back to first node
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.keyboard.press('Escape');
    
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    await page.keyboard.press('i');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.keyboard.press('Escape');
    
    // Connect nodes
    await page.keyboard.press('c');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify edge was created
    const state = await this.getComponentState(page);
    if (state.edgeCount === 0) {
      return { passed: false, message: 'No edge created' };
    }
    
    return { passed: true, message: 'Edge creation workflow working' };
  }

  async stressTestWorkflow(page) {
    await page.goto('http://localhost:4200');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const startTime = Date.now();
    const nodeCount = 50;
    
    // Create many nodes
    for (let i = 0; i < nodeCount; i++) {
      await page.keyboard.press('i');
      await new Promise(resolve => setTimeout(resolve, 100));
      await page.keyboard.press('Escape');
      
      switch (i) {
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
        
        default:
          // Move crosshairs for next node
          await page.keyboard.press('l');
          if (i % 5 === 0) {
            await page.keyboard.press('j');
          }
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verify all nodes were created
    const state = await this.getComponentState(page);
    if (state.nodeCount < nodeCount) {
      return { passed: false, message: `Only ${state.nodeCount}/${nodeCount} nodes created` };
    }
    
    // Performance check (should complete within reasonable time)
    if (duration > 10000) { // 10 seconds
      return { passed: false, message: `Performance issue: took ${duration}ms` };
    }
    
    return { passed: true, message: `Created ${nodeCount} nodes in ${duration}ms` };
  }

  async keyboardWorkflow(page) {
    await page.goto('http://localhost:4200?demo=true');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const initialPos = await this.getCrosshairsPosition(page);
    
    // Test all movement keys
    await page.keyboard.press('h');
    await new Promise(resolve => setTimeout(resolve, 100));
    const leftPos = await this.getCrosshairsPosition(page);
    
    await page.keyboard.press('l');
    await new Promise(resolve => setTimeout(resolve, 100));
    const rightPos = await this.getCrosshairsPosition(page);
    
    await page.keyboard.press('k');
    await new Promise(resolve => setTimeout(resolve, 100));
    const upPos = await this.getCrosshairsPosition(page);
    
    await page.keyboard.press('j');
    await new Promise(resolve => setTimeout(resolve, 100));
    const downPos = await this.getCrosshairsPosition(page);
    
    // Verify movements
    if (leftPos.x >= initialPos.x) {
      return { passed: false, message: 'Left movement not working' };
    }
    
    if (rightPos.x <= leftPos.x) {
      return { passed: false, message: 'Right movement not working' };
    }
    
    if (upPos.y >= rightPos.y) {
      return { passed: false, message: 'Up movement not working' };
    }
    
    if (downPos.y <= upPos.y) {
      return { passed: false, message: 'Down movement not working' };
    }
    
    // Test recenter commands
    await page.keyboard.press('f');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const recenterPos = await this.getCrosshairsPosition(page);
    if (Math.abs(recenterPos.x - 400) > 10 || Math.abs(recenterPos.y - 112) > 10) {
      return { passed: false, message: 'Recenter not working' };
    }
    
    return { passed: true, message: 'All keyboard navigation working' };
  }

  // Helper methods
  async getComponentState(page) {
    return await page.evaluate(() => {
      const appElement = document.querySelector('app-drawing-area');
      // Accessing Angular component for testing
      const component = window.ng.getComponent(appElement);
      
      const nodes = component.drawingLayer['daNodes'] || [];
      const edges = component.drawingLayer['daEdges'] || [];
      
      return {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes: nodes.map(node => ({
          x: node.group ? node.group.x() : 0,
          y: node.group ? node.group.y() : 0,
          width: node.NODE_WIDTH,
          height: node.NODE_HEIGHT,
          selected: node.isSelected
        })),
        edges: edges.map(edge => ({
          linePoints: edge.line ? edge.line.points() : []
        }))
      };
    });
  }

  async getCrosshairsPosition(page) {
    return await page.evaluate(() => {
      const appElement = document.querySelector('app-drawing-area');
      // Accessing Angular component for testing
      const component = window.ng.getComponent(appElement);
      return {
        x: component.crosshairsLayer.crosshairsX(),
        y: component.crosshairsLayer.crosshairsY()
      };
    });
  }

  async getScale(page) {
    return await page.evaluate(() => {
      const appElement = document.querySelector('app-drawing-area');
      // Accessing Angular component for testing
      const component = window.ng.getComponent(appElement);
      return component.drawingLayer.scaleX();
    });
  }
}

// Run the tests
const tester = new E2EWorkflowTester();
const testFilter = process.argv[2]; // Get test filter from command line
tester.runTests(testFilter).catch(console.error);
