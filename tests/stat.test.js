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

    await page.waitForFunction(() => window.player !== undefined, { timeout: 5000 });

    const result = await page.evaluate(() => {
      if (typeof window.createStat !== 'function') {
        throw new Error('createStat is not defined');
      }

      const statObj = window.createStat("main.stat.speed", [window.player.pos.x, window.player.pos.y], window.player);
      
      const initialSpeed = window.player.speed;
      
      // Simulate interaction
      statObj.interact();
      const speedAfterFirst = window.player.speed;
      
      statObj.interact();
      const speedAfterSecond = window.player.speed;
      
      return {
        initialSpeed,
        speedAfterFirst,
        speedAfterSecond
      };
    });
    
    if (result.initialSpeed === 200 && result.speedAfterFirst === 100 && result.speedAfterSecond === 200) {
      console.log('PASS: Stat object toggles player speed successfully');
      process.exit(0);
    } else {
      console.error(`FAIL: Speed toggle failed. Initial: ${result.initialSpeed}, 1st: ${result.speedAfterFirst}, 2nd: ${result.speedAfterSecond}`);
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
