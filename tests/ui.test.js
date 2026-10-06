const { fail, sleep } = require('./harness');

module.exports = {
  async run(page) {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    await page.click('canvas');

    // Wait for the game to finish loading (window.ui is set in k.onLoad).
    await page.waitForFunction(() => window.ui && window.ui.msgBox && window.ui.text);

    // --- Phase 1: On load, the message box and text must be hidden. ---
    // This locks in the fix for the "[object Object] always visible" bug:
    // the text content must be empty and both objects must have opacity 0.
    const initial = await page.evaluate(() => ({
      boxOpacity: window.ui.msgBox.opacity,
      textOpacity: window.ui.text.opacity,
      textContent: window.ui.text.text,
    }));

    if (initial.boxOpacity !== 0 || initial.textOpacity !== 0) {
      fail(`Message box/text should be hidden on load. Got boxOpacity=${initial.boxOpacity}, textOpacity=${initial.textOpacity}`);
    }
    if (initial.textContent !== "") {
      fail(`Text content should be empty on load (no "[object Object]"). Got "${initial.textContent}"`);
    }

    // --- Phase 2: ui.show() -> text + background appear. ---
    // The interaction->show wiring is covered by narrative.test.js; here we
    // exercise the show() behavior directly (the code that was fixed).
    await page.evaluate(() => {
      window.ui.show("The air feels heavy here...");
    });
    await sleep(100);

    const shown = await page.evaluate(() => ({
      boxOpacity: window.ui.msgBox.opacity,
      textOpacity: window.ui.text.opacity,
      textContent: window.ui.text.text,
    }));

    if (shown.boxOpacity !== 1 || shown.textOpacity !== 1) {
      fail(`Message box/text should be visible after show(). Got boxOpacity=${shown.boxOpacity}, textOpacity=${shown.textOpacity}`);
    }
    if (shown.textContent !== "The air feels heavy here...") {
      fail(`Expected "The air feels heavy here...", got "${shown.textContent}"`);
    }

    // --- Phase 3: After 5 seconds, the text and background must disappear. ---
    // This locks in the fix for the "text never hides" bug (visible->opacity).
    await sleep(5500);

    const hidden = await page.evaluate(() => ({
      boxOpacity: window.ui.msgBox.opacity,
      textOpacity: window.ui.text.opacity,
    }));

    if (hidden.boxOpacity !== 0 || hidden.textOpacity !== 0) {
      fail(`Message box/text should auto-hide after 5 seconds. Got boxOpacity=${hidden.boxOpacity}, textOpacity=${hidden.textOpacity}`);
    }

    console.log('PASS: UI message box hidden on load, shown on show(), auto-hidden after 5s');
  },
};
