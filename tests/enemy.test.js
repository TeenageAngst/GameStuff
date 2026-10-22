const { fail, sleep } = require('./harness');

module.exports = {
  async run(page) {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    await page.click('canvas');

    // Walk through the east door into the hallway: the door spans
    // x:[752,800], y:[268,332]; park the player overlapping its left edge.
    await page.evaluate(() => {
      window.player.pos.x = 745;
      window.player.pos.y = 300;
    });
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.rooms.currentRoom === 'hallway1', { timeout: 8000 });
    console.log('PASS: entered hallway1');

    // Enemies exist.
    const count = await page.evaluate(() => window.k.get('enemy').length);
    if (count < 4) {
      fail(`Expected at least 4 enemies, found ${count}`);
    }
    console.log(`PASS: ${count} enemies spawned`);

    // Enemies patrol (position changes over time).
    const p0 = await page.evaluate(() => {
      const e = window.k.get('enemy')[0];
      return { x: e.pos.x, y: e.pos.y };
    });
    await sleep(900);
    const p1 = await page.evaluate(() => {
      const e = window.k.get('enemy')[0];
      return { x: e.pos.x, y: e.pos.y };
    });
    if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 5) {
      fail('Enemy did not move over 900ms');
    }
    console.log('PASS: enemies patrol');

    // Touching an enemy knocks the player back and grants iframes.
    // (Waits are game-time based: headless software rendering runs the
    // game clock slower than wall time.)
    const before = await page.evaluate(() => {
      const e = window.k.get('enemy')[0];
      window.player.pos.x = e.pos.x;
      window.player.pos.y = e.pos.y;
      return { ex: e.pos.x, ey: e.pos.y, t0: window.k.time() };
    });
    await page.waitForFunction(
      (t0) => window.k.time() > t0 + 1.2,
      before.t0, { timeout: 30000 },
    );
    const after = await page.evaluate(() => ({
      vulnAt: window.player.nextVulnAt || 0,
      now: window.k.time(),
      px: window.player.pos.x,
      py: window.player.pos.y,
    }));
    if (!(after.vulnAt > before.t0)) {
      fail('Player did not gain invulnerability on enemy touch');
    }
    const dist = Math.hypot(after.px - before.ex, after.py - before.ey);
    if (dist < 10) {
      fail(`Player was not knocked back (moved ${dist.toFixed(1)}px)`);
    }
    console.log('PASS: enemy touch knocks player back with iframes');

    console.log('ALL ENEMY TESTS PASSED');
  },
};
