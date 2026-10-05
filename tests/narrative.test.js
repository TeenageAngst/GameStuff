const { chromium } = require('playwright');
const { exec } = require('child_process');

(async () => {
  const server = exec('npx serve .');
  await new Promise(resolve => setTimeout(resolve, 2000));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    await page.click('canvas');

    // Setup: Ensure we have a player and a way to track the message
    await page.evaluate(() => {
      window.lastMessage = null;
      // We will override the UI show method to track calls
      // This assumes createUI is called and assigned to window.ui in main.js
      if (window.ui && window.ui.show) {
        const originalShow = window.ui.show;
        window.ui.show = (msg) => {
          window.lastMessage = msg;
          originalShow(msg);
        };
      }
    });

    // Create a narrative object at player position for easy interaction
    await page.evaluate(() => {
      if (!window.player) throw new Error('Player not found on window object');
      
      // We need createNarrativeObject to be available or we define it here for the test
      // But the goal is to test the actual implementation.
      // So we'll assume main.js has already created one or we create one using the game's API
      if (typeof createNarrativeObject === 'function') {
        createNarrativeObject(window.player.pos, "The air feels heavy here...", window.ui);
      } else {
        // Fallback for the first RED run where createNarrativeObject doesn't exist yet
        throw new Error('createNarrativeObject is not defined');
      }
    });

    // Press 'e' to interact
    await page.keyboard.press('e');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if the message was set
    const message = await page.evaluate(() => window.lastMessage);
    
    if (message === "The air feels heavy here...") {
      console.log('PASS: Narrative message displayed successfully');
      process.exit(0);
    } else {
      console.error(`FAIL: Expected "The air feels heavy here...", got "${message}"`);
      process.exit(1);
    }
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
    server.kill();
  }
})();
