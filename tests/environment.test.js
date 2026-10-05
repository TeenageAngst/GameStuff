const { chromium } = require('playwright');
const { exec } = require('child_process');

// Read the alpha channel of a single pixel on the lighting overlay canvas.
// The overlay is the fixed, pointer-events:none canvas the lighting system
// appends to the DOM. Returns null if the overlay is not found.
async function readOverlayAlpha(page, x, y) {
  return page.evaluate(
    ([px, py]) => {
      const canvases = [...document.querySelectorAll('canvas')];
      const overlay = canvases.find(
        (c) => c.style.position === 'fixed' && c.style.pointerEvents === 'none'
      );
      if (!overlay) return null;
      const ctx = overlay.getContext('2d');
      const data = ctx.getImageData(px, py, 1, 1).data;
      return data[3]; // alpha (0-255)
    },
    [x, y]
  );
}

// The overlay is filled with 65% black when no light is on, so a pixel far
// from any light should have alpha ~= 0.65 * 255 ~= 166.
const DARK_ALPHA = 166;
const TOL = 16; // tolerance band for "full darkness"

(async () => {
  const server = exec('npx serve .');
  await new Promise(resolve => setTimeout(resolve, 5000));

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    await page.click('canvas');

    await page.waitForFunction(() => window.player !== undefined, { timeout: 5000 });

    // Setup: create a light object at the player's position so the player is
    // colliding with it (required for the E-key interaction to target it).
    await page.evaluate(() => {
      if (typeof window.createEnvironmentObject !== 'function') {
        throw new Error('createEnvironmentObject is not defined on window');
      }
      window.testLight = window.createEnvironmentObject(window.player.pos);
    });

    // 1. The light starts OFF.
    const initialOn = await page.evaluate(() => window.testLight.lightOn);
    if (initialOn !== false) {
      console.error(`FAIL: Light should start OFF, got lightOn=${initialOn}`);
      process.exit(1);
    }
    console.log('PASS: Light starts OFF');

    // 2. The light is registered with the lighting system (has an intensity).
    const registered = await page.evaluate(
      () => typeof window.testLight.intensity === 'number'
    );
    if (!registered) {
      console.error('FAIL: Light is not registered with the lighting system');
      process.exit(1);
    }
    console.log('PASS: Light is registered with the lighting system');

    // 3. The lighting overlay canvas exists in the DOM (800x600, fixed, no
    //    pointer events).
    const overlayInfo = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')];
      const overlay = canvases.find(
        (c) => c.style.position === 'fixed' && c.style.pointerEvents === 'none'
      );
      if (!overlay) return null;
      return { width: overlay.width, height: overlay.height };
    });
    if (!overlayInfo) {
      console.error('FAIL: Lighting overlay canvas not found in DOM');
      process.exit(1);
    }
    if (overlayInfo.width !== 800 || overlayInfo.height !== 600) {
      console.error(
        `FAIL: Overlay canvas wrong size, got ${overlayInfo.width}x${overlayInfo.height}`
      );
      process.exit(1);
    }
    console.log('PASS: Lighting overlay canvas exists (800x600)');

    // Compute a point near the light (within its radius, outside its core)
    // and a point far from it, relative to the light's actual center.
    const { nearX, nearY } = await page.evaluate(() => {
      const l = window.testLight;
      const cx = l.pos.x + (l.width || 32) / 2;
      const cy = l.pos.y + (l.height || 32) / 2;
      return { nearX: cx, nearY: cy + 100 }; // 100px below the light center
    });
    const farX = 10;
    const farY = 10;

    // 4. With the light OFF, the whole scene is uniformly dark: both the far
    //    corner and the point near the light are at full darkness (~166).
    const offFar = await readOverlayAlpha(page, farX, farY);
    const offNear = await readOverlayAlpha(page, nearX, nearY);
    if (offFar === null || offNear === null) {
      console.error('FAIL: Could not read overlay pixels (light OFF)');
      process.exit(1);
    }
    if (Math.abs(offFar - DARK_ALPHA) > TOL || Math.abs(offNear - DARK_ALPHA) > TOL) {
      console.error(
        `FAIL: With light OFF, scene should be uniformly dark (~${DARK_ALPHA}); ` +
          `got far=${offFar}, near=${offNear}`
      );
      process.exit(1);
    }
    console.log('PASS: With light OFF, scene is uniformly dark');

    // 5. Press 'e' to toggle the light ON, then wait for the 0.2s fade to
    //    complete before sampling pixels.
    await page.keyboard.press('e');
    await new Promise(resolve => setTimeout(resolve, 350));
    const onAfterFirst = await page.evaluate(() => window.testLight.lightOn);
    if (onAfterFirst !== true) {
      console.error(`FAIL: Light should be ON after first toggle, got lightOn=${onAfterFirst}`);
      process.exit(1);
    }
    console.log('PASS: Light toggles ON');

    // 6. With the light ON, the far corner stays dark but the point near the
    //    light is brightened (its overlay alpha is significantly reduced).
    const onFar = await readOverlayAlpha(page, farX, farY);
    const onNear = await readOverlayAlpha(page, nearX, nearY);
    if (onFar === null || onNear === null) {
      console.error('FAIL: Could not read overlay pixels (light ON)');
      process.exit(1);
    }
    if (Math.abs(onFar - DARK_ALPHA) > TOL) {
      console.error(
        `FAIL: With light ON, far corner should stay dark (~${DARK_ALPHA}); got ${onFar}`
      );
      process.exit(1);
    }
    if (onNear > DARK_ALPHA - 40) {
      console.error(
        `FAIL: With light ON, point near the light should be brightened ` +
          `(alpha < ${DARK_ALPHA - 40}); got ${onNear}`
      );
      process.exit(1);
    }
    console.log('PASS: With light ON, area near the light is brightened');

    // 7. Press 'e' again to toggle the light OFF.
    await page.keyboard.press('e');
    await new Promise(resolve => setTimeout(resolve, 350));
    const onAfterSecond = await page.evaluate(() => window.testLight.lightOn);
    if (onAfterSecond !== false) {
      console.error(`FAIL: Light should be OFF after second toggle, got lightOn=${onAfterSecond}`);
      process.exit(1);
    }
    console.log('PASS: Light toggles OFF');

    // 8. After toggling OFF, the scene returns to uniform darkness.
    const offAgainNear = await readOverlayAlpha(page, nearX, nearY);
    if (offAgainNear === null) {
      console.error('FAIL: Could not read overlay pixels (light OFF again)');
      process.exit(1);
    }
    if (Math.abs(offAgainNear - DARK_ALPHA) > TOL) {
      console.error(
        `FAIL: After toggling OFF, scene should return to uniform darkness ` +
          `(~${DARK_ALPHA}); got near=${offAgainNear}`
      );
      process.exit(1);
    }
    console.log('PASS: After toggling OFF, scene returns to uniform darkness');

    console.log('All environment/light tests passed');
    process.exit(0);

  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
    server.kill();
  }
})();
