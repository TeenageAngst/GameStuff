const { fail, sleep } = require('./harness');

module.exports = {
  async run(page) {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    await page.click('canvas');

    // Setup interactable object in the browser context
    await page.evaluate(() => {
      if (!window.player) throw new Error('Player not found on window object');

      // Create an interactable object at the player's position
      window.testInteractable = add([
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

    // Wait for the physics engine to register the collision between the
    // player and the newly created object (isColliding() needs a frame).
    await page.waitForFunction(
      () => window.player.isColliding(window.testInteractable),
      { timeout: 5000 }
    );

    // Press 'e' to interact
    await page.keyboard.press('e');
    // Give it a moment to process the interaction
    await sleep(100);

    // Check if interact() was called
    const interacted = await page.evaluate(() => window.interacted);

    if (interacted) {
      console.log('PASS: Interaction triggered successfully');
    } else {
      fail('Interaction was not triggered');
    }
  },
};
