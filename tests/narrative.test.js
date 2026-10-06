const { fail, sleep } = require('./harness');

module.exports = {
  async run(page) {
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

    // Create a narrative object at player position for easy interaction.
    // The message is looked up from the TEXTS registry by the object ID
    // (naming convention: <room>.<type>.<name>).
    await page.evaluate(() => {
      if (!window.player) throw new Error('Player not found on window object');

      if (typeof window.createNarrative === 'function') {
        window.testNarrative = window.createNarrative("main.narrative.air", window.player.pos, window.ui);
      } else {
        throw new Error('createNarrative is not defined');
      }
    });

    // Wait for the physics engine to register the collision between the
    // player and the newly created object (isColliding() needs a frame).
    await page.waitForFunction(
      () => window.player.isColliding(window.testNarrative),
      { timeout: 5000 }
    );

    // Press 'e' to interact
    await page.keyboard.press('e');
    await sleep(100);

    // Check if the message was set
    const message = await page.evaluate(() => window.lastMessage);

    if (message === "The air feels heavy here...") {
      console.log('PASS: Narrative message displayed successfully');
    } else {
      fail(`Expected "The air feels heavy here...", got "${message}"`);
    }
  },
};
