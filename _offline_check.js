const { chromium } = require('playwright');
const { exec } = require('child_process');

(async () => {
  const server = exec('npx serve .');
  await new Promise(r => setTimeout(r, 2000));

  const browser = await chromium.launch();
  const context = await browser.newContext();
  // Block EVERYTHING that is not the local dev server. If the game still
  // boots, it is fully self-contained / offline-capable.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:3000')) return route.continue();
    return route.abort('blocked');
  });

  const page = await context.newPage();
  const blocked = [];
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (!u.startsWith('http://localhost:3000')) blocked.push(u);
  });

  try {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    await page.waitForFunction(() => window.k && window.player, { timeout: 10000 });
    const dims = await page.$eval('canvas', el => [el.width, el.height]);
    const ready = await page.evaluate(() => !!(window.k && window.player));
    console.log('Canvas:', dims.join('x'));
    console.log('Game objects ready (k + player):', ready);
    console.log('Blocked external requests:', blocked.length ? blocked : 'none');
    if (dims[0] === 800 && dims[1] === 600 && ready) {
      console.log('PASS: Game boots fully offline (no external requests needed)');
      process.exit(0);
    } else {
      console.error('FAIL: game did not fully initialize offline');
      process.exit(1);
    }
  } catch (e) {
    console.error('FAIL:', e.message);
    console.error('Blocked:', blocked);
    process.exit(1);
  } finally {
    await browser.close();
    server.kill();
  }
})();
