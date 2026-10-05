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

    // Initial position
    const initialPos = await page.evaluate(() => {
      if (!window.player) throw new Error('Player not found on window object');
      return { x: window.player.pos.x, y: window.player.pos.y };
    });

    console.log(`Initial Position: ${initialPos.x}, ${initialPos.y}`);

    // Sprite Test: player must be a sprite (not a blue square) at 32x32.
    // A k.sprite() entity exposes animation methods (play/stop/numFrames/curAnim)
    // and has no `color` property; a k.rect() blue square would have `color` and
    // none of the sprite methods.
    const spriteInfo = await page.evaluate(() => {
      const p = window.player;
      return {
        isSprite:
          typeof p.play === 'function' &&
          typeof p.stop === 'function' &&
          p.numFrames !== undefined &&
          p.curAnim !== undefined,
        isRect: p.color !== undefined,
        width: p.width,
        height: p.height,
      };
    });

    if (!spriteInfo.isSprite || spriteInfo.isRect) {
      console.error('FAIL: Player is not a sprite (still a rect/blue square)');
      process.exit(1);
    }
    console.log('PASS: Player is a sprite');

    if (spriteInfo.width !== 32 || spriteInfo.height !== 32) {
      console.error(`FAIL: Player sprite is not 32x32. Got: ${spriteInfo.width}x${spriteInfo.height}`);
      process.exit(1);
    }
    console.log('PASS: Player sprite is 32x32');

    // Move Right
    await page.keyboard.down('ArrowRight');
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.up('ArrowRight');
    const posAfterRight = await page.evaluate(() => window.player.pos.x);
    
    if (posAfterRight > initialPos.x) {
      console.log('PASS: Player moved right');
    } else {
      console.error(`FAIL: Player did not move right. Initial: ${initialPos.x}, After: ${posAfterRight}`);
      process.exit(1);
    }

    // Move Left
    await page.keyboard.down('ArrowLeft');
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.up('ArrowLeft');
    const posAfterLeft = await page.evaluate(() => window.player.pos.x);
    if (posAfterLeft < posAfterRight) {
      console.log('PASS: Player moved left');
    } else {
      console.error(`FAIL: Player did not move left. Before: ${posAfterRight}, After: ${posAfterLeft}`);
      process.exit(1);
    }

    // Move Up
    await page.keyboard.down('ArrowUp');
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.up('ArrowUp');
    const posAfterUp = await page.evaluate(() => window.player.pos.y);
    if (posAfterUp < initialPos.y) {
      console.log('PASS: Player moved up');
    } else {
      console.error(`FAIL: Player did not move up. Initial: ${initialPos.y}, After: ${posAfterUp}`);
      process.exit(1);
    }

    // Move Down
    await page.keyboard.down('ArrowDown');
    await new Promise(resolve => setTimeout(resolve, 200));
    await page.keyboard.up('ArrowDown');
    const posAfterDown = await page.evaluate(() => window.player.pos.y);
    if (posAfterDown > posAfterUp) {
      console.log('PASS: Player moved down');
    } else {
      console.error(`FAIL: Player did not move down. Before: ${posAfterUp}, After: ${posAfterDown}`);
      process.exit(1);
    }

    // Boundary Test: Right (Teleport and check snap)
    await page.evaluate(() => {
      window.player.pos.x = 900;
    });
    await page.waitForFunction(() => window.player.pos.x <= 800, { timeout: 2000 });
    console.log('PASS: Player snapped back from right boundary');

    // Boundary Test: Left (Teleport and check snap)
    await page.evaluate(() => {
      window.player.pos.x = -100;
    });
    await page.waitForFunction(() => window.player.pos.x >= 0, { timeout: 2000 });
    console.log('PASS: Player snapped back from left boundary');

    // Boundary Test: Down (Teleport and check snap)
    await page.evaluate(() => {
      window.player.pos.y = 700;
    });
    await page.waitForFunction(() => window.player.pos.y <= 600, { timeout: 2000 });
    console.log('PASS: Player snapped back from bottom boundary');

    // Boundary Test: Up (Teleport and check snap)
    await page.evaluate(() => {
      window.player.pos.y = -100;
    });
    await page.waitForFunction(() => window.player.pos.y >= 0, { timeout: 2000 });
    console.log('PASS: Player snapped back from top boundary');

    console.log('ALL PLAYER MOVEMENT AND BOUNDARY TESTS PASSED');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
    server.kill();
  }
})();
