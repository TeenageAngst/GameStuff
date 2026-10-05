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
    const canvas = await page.$('canvas');
    const width = await canvas.evaluate(el => el.width);
    const height = await canvas.evaluate(el => el.height);
    
    if (width === 800 && height === 600) {
      console.log('PASS: Canvas initialized with correct dimensions (800x600)');
      process.exit(0);
    } else {
      console.error(`FAIL: Canvas dimensions incorrect. Got ${width}x${height}, expected 800x600`);
      process.exit(1);
    }
  } catch (e) {
    console.error('FAIL: Could not verify canvas:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
    server.kill();
  }
})();
