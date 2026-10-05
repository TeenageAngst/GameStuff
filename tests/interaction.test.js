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

    // Setup interactable object in the browser context
    await page.evaluate(() => {
      if (!window.player) throw new Error('Player not found on window object');
      
      // Create an interactable object at the player's position
      add([
        rect(32, 32),
        pos(window.player.pos),
        area(),
        "interactable",
        {
          interact: () => {
            window.interacted = true;
          }
        }
      ]);
      window.interacted = false;
    });

    // Press 'e' to interact
    await page.keyboard.press('e');
    // Give it a moment to process the interaction
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if interact() was called
    const interacted = await page.evaluate(() => window.interacted);
    
    if (interacted) {
      console.log('PASS: Interaction triggered successfully');
      process.exit(0);
    } else {
      console.error('FAIL: Interaction was not triggered');
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
