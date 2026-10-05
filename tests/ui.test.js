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
      console.error(`FAIL: Message box/text should be hidden on load. Got boxOpacity=${initial.boxOpacity}, textOpacity=${initial.textOpacity}`);
      process.exit(1);
    }
    if (initial.textContent !== "") {
      console.error(`FAIL: Text content should be empty on load (no "[object Object]"). Got "${initial.textContent}"`);
      process.exit(1);
    }

    // --- Phase 2: ui.show() -> text + background appear. ---
    // The interaction->show wiring is covered by narrative.test.js; here we
    // exercise the show() behavior directly (the code that was fixed).
    await page.evaluate(() => {
      window.ui.show("The air feels heavy here...");
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    const shown = await page.evaluate(() => ({
      boxOpacity: window.ui.msgBox.opacity,
      textOpacity: window.ui.text.opacity,
      textContent: window.ui.text.text,
    }));

    if (shown.boxOpacity !== 1 || shown.textOpacity !== 1) {
      console.error(`FAIL: Message box/text should be visible after show(). Got boxOpacity=${shown.boxOpacity}, textOpacity=${shown.textOpacity}`);
      process.exit(1);
    }
    if (shown.textContent !== "The air feels heavy here...") {
      console.error(`FAIL: Expected "The air feels heavy here...", got "${shown.textContent}"`);
      process.exit(1);
    }

    // --- Phase 3: After 5 seconds, the text and background must disappear. ---
    // This locks in the fix for the "text never hides" bug (visible->opacity).
    await new Promise(resolve => setTimeout(resolve, 5500));

    const hidden = await page.evaluate(() => ({
      boxOpacity: window.ui.msgBox.opacity,
      textOpacity: window.ui.text.opacity,
    }));

    if (hidden.boxOpacity !== 0 || hidden.textOpacity !== 0) {
      console.error(`FAIL: Message box/text should auto-hide after 5 seconds. Got boxOpacity=${hidden.boxOpacity}, textOpacity=${hidden.textOpacity}`);
      process.exit(1);
    }

    console.log('PASS: UI message box hidden on load, shown on show(), auto-hidden after 5s');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
    server.kill();
  }
})();
