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

    // The narrative object at [200, 200] is a 32x32 static body (see
    // src/objects.js createNarrative). Its box spans x:[200,232], y:[200,232].
    // The player is a 32x32 body (half-extent 16).
    const OBJECT = { x: 200, y: 200, size: 32 };
    const PLAYER_HALF = 16;

    // --- Test 1: Head-on collision with the object. ---
    // Place the player to the right of the object, vertically aligned with
    // its center, then push left. The player must be blocked at the object's
    // right edge (x = 232) and stop at x = 232 + 16 = 248.
    //
    // (The previous version moved diagonally up-left, which passes ABOVE the
    // object and never collides, so it could not actually verify collision.)
    await page.evaluate(() => {
      window.player.pos.x = 400;
      window.player.pos.y = 216; // OBJECT.y + OBJECT.size/2 = 200 + 16, aligned with object center
    });

    await page.keyboard.down('ArrowLeft');
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.keyboard.up('ArrowLeft');

    const posAfter = await page.evaluate(() => ({ x: window.player.pos.x, y: window.player.pos.y }));
    console.log(`Position after pushing into object: ${posAfter.x}, ${posAfter.y}`);

    const blockedX = OBJECT.x + OBJECT.size + PLAYER_HALF; // 248
    if (posAfter.x < blockedX - 10) {
      console.error(`FAIL: Player passed through object. Expected x >= ${blockedX - 10}, got ${posAfter.x}`);
      process.exit(1);
    }
    console.log('PASS: Player blocked by object (head-on collision)');

    // --- Test 2: Screen boundaries. ---
    await page.evaluate(() => { window.player.pos.x = 900; });
    await page.waitForFunction(() => window.player.pos.x <= 800, { timeout: 2000 });
    console.log('PASS: Player snapped back from right boundary');

    await page.evaluate(() => { window.player.pos.y = -100; });
    await page.waitForFunction(() => window.player.pos.y >= 0, { timeout: 2000 });
    console.log('PASS: Player snapped back from top boundary');

    console.log('ALL COLLISION AND BOUNDARY TESTS PASSED');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
    server.kill();
  }
})();
