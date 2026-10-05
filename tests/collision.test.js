const { chromium } = require('playwright');
const { exec } = require('child_process');

(async () => {
  const server = exec('npx serve .');
  await new Promise(resolve => setTimeout(resolve, 2000));

  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));
  
  try {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');

    // Get player and an object position
    const data = await page.evaluate(() => {
      if (!window.player) throw new Error('Player not found');
      // Find any object that is not the player
      // In main.js, objects are created but not stored in window.
      // We can try to find them via kaboom's get() if we had access, 
      // but we can just check if player can move to a known object position.
      return {
        playerPos: { x: window.player.pos.x, y: window.player.pos.y },
        // Based on main.js: createNarrativeObject(k, [200, 200], ...)
        objectPos: { x: 200, y: 200 }
      };
    });

    console.log(`Player Initial Pos: ${data.playerPos.x}, ${data.playerPos.y}`);
    console.log(`Target Object Pos: ${data.objectPos.x}, ${data.objectPos.y}`);

    // Move player towards the object at [200, 200]
    // We'll use a simple loop to move the player
    const movePlayerTo = async (targetX, targetY) => {
      const currentPos = await page.evaluate(() => ({ x: window.player.pos.x, y: window.player.pos.y }));
      
      while (Math.abs(currentPos.x - targetX) > 10 || Math.abs(currentPos.y - targetY) > 10) {
        const dx = targetX - currentPos.x;
        const dy = targetY - currentPos.y;
        
        if (dx > 0) await page.keyboard.down('ArrowRight');
        else if (dx < 0) await page.keyboard.down('ArrowLeft');
        
        if (dy > 0) await page.keyboard.down('ArrowDown');
        else if (dy < 0) await page.keyboard.down('ArrowUp');
        
        await new Promise(resolve => setTimeout(resolve, 100));
        await page.keyboard.up('ArrowRight');
        await page.keyboard.up('ArrowLeft');
        await page.keyboard.up('ArrowUp');
        await page.keyboard.up('ArrowDown');
        
        const newPos = await page.evaluate(() => ({ x: window.player.pos.x, y: window.player.pos.y }));
        if (Math.abs(newPos.x - targetX) < 5 && Math.abs(newPos.y - targetY) < 5) break;
        // Update currentPos for next iteration
        // This is a bit clunky, let's just use a fixed time
      }
    };

    // Test 1: Collision with object at [200, 200]
    // Move player towards the object
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowUp');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowUp');

    const posAfterCollisionAttempt = await page.evaluate(() => ({ x: window.player.pos.x, y: window.player.pos.y }));
    console.log(`Position after collision attempt: ${posAfterCollisionAttempt.x}, ${posAfterCollisionAttempt.y}`);

    // If collision works, player should NOT be able to pass the object.
    // Object is at 200, 200. Player starts at 400, 300.
    // If player passes the object, x will be < 200 and y will be < 200.
    if (posAfterCollisionAttempt.x < 180 && posAfterCollisionAttempt.y < 180) {
      console.error(`FAIL: Player passed through object. Position: ${posAfterCollisionAttempt.x}, ${posAfterCollisionAttempt.y}`);
      process.exit(1);
    }

    // Test 2: Screen Boundaries
    // Move player far to the left
    await page.keyboard.down('ArrowLeft');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.keyboard.up('ArrowLeft');

    const posAfterLeftEdge = await page.evaluate(() => ({ x: window.player.pos.x, y: window.player.pos.y }));
    console.log(`Position after moving left: ${posAfterLeftEdge.x}, ${posAfterLeftEdge.y}`);

    if (posAfterLeftEdge.x < 0) {
      console.error(`FAIL: Player went off-screen left. Position: ${posAfterLeftEdge.x}`);
      process.exit(1);
    }

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
