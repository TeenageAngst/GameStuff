const { fail, sleep } = require('./harness');

// Regression tests for:
//   1. Room handlers never being cancelled (they checked `obj.destroyed`,
//      which this kaplay build never sets — destroyed objects report
//      `exists() === false` instead).
//   2. Pressing E next to a hallway piston throwing
//      "interactable.interact is not a function".
module.exports = {
  async run(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && /interact is not a function/.test(m.text())) {
        errors.push(m.text());
      }
    });

    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    await page.waitForFunction(() => window.rooms !== undefined);
    await page.click('canvas');

    // Track every k.onUpdate handler registered from here on, and whether
    // it gets cancelled.
    await page.evaluate(() => {
      window.__handlers = [];
      const orig = window.k.onUpdate;
      window.k.onUpdate = (...args) => {
        const ctrl = orig(...args);
        const rec = { cancelled: false };
        const cancel = ctrl.cancel.bind(ctrl);
        ctrl.cancel = () => { rec.cancelled = true; cancel(); };
        window.__handlers.push(rec);
        return ctrl;
      };
    });

    // Enter the hallway through the east door.
    await page.evaluate(() => {
      window.player.pos.x = 745;
      window.player.pos.y = 300;
    });
    await page.keyboard.press('e');
    await page.waitForFunction(
      () => window.rooms.currentRoom === 'hallway1' && !window.rooms.isTransitioning(),
      null, { timeout: 8000 });
    const registered = await page.evaluate(() => window.__handlers.length);
    if (registered === 0) fail('Expected hallway to register update handlers');
    console.log(`PASS: hallway registered ${registered} update handlers`);

    // Pistons are shadow casters, not interactables.
    const pistonTags = await page.evaluate(() => {
      const w = window.k.get('hallway1.wall.0')[0];
      return { interactable: w.is('interactable'), shadowCaster: w.is('shadowCaster') };
    });
    if (pistonTags.interactable || !pistonTags.shadowCaster) {
      fail(`Piston tags wrong: ${JSON.stringify(pistonTags)}`);
    }
    console.log('PASS: pistons are tagged shadowCaster, not interactable');

    // Push into the first piston and press E: must not throw.
    await page.evaluate(() => {
      const w = window.k.get('hallway1.wall.0')[0];
      window.player.pos.x = w.pos.x - 30;
      window.player.pos.y = w.pos.y + 70;
      window.player.nextVulnAt = Infinity; // ignore wisps for this check
    });
    await page.keyboard.down('ArrowRight');
    let touching = false;
    for (let i = 0; i < 40 && !touching; i++) {
      await sleep(50);
      touching = await page.evaluate(() =>
        window.player.isColliding(window.k.get('hallway1.wall.0')[0]));
    }
    await page.keyboard.press('e');
    await sleep(200);
    await page.keyboard.up('ArrowRight');
    if (errors.length) fail(`Pressing E by a piston threw: ${errors.join(' | ')}`);
    console.log(`PASS: pressing E by a piston does not throw (touching=${touching})`);

    // Leave through the west door; every hallway handler must cancel itself.
    await page.evaluate(() => {
      window.player.nextVulnAt = 0;
      window.player.pos.x = 60;
      window.player.pos.y = 150;
    });
    await page.keyboard.press('e');
    await page.waitForFunction(
      () => window.rooms.currentRoom === 'main' && !window.rooms.isTransitioning(),
      null, { timeout: 8000 });
    await sleep(200);
    const leaked = await page.evaluate(() => window.__handlers.filter((h) => !h.cancelled).length);
    if (leaked > 0) fail(`${leaked} hallway update handler(s) still running after leaving`);
    console.log('PASS: all hallway update handlers cancelled after leaving');

    console.log('ALL ROOM CLEANUP TESTS PASSED');
  },
};
