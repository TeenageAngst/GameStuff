const { fail, sleep } = require('./harness');

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

module.exports = {
  async run(page) {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');
    await page.click('canvas');

    await page.waitForFunction(() => window.player !== undefined, { timeout: 5000 });

    // Setup: create a light object at the player's position so the player is
    // colliding with it (required for the E-key interaction to target it).
    await page.evaluate(() => {
      if (typeof window.createLight !== 'function') {
        throw new Error('createLight is not defined on window');
      }
      window.testLight = window.createLight("main.environment.light", window.player.pos);
    });

    // Wait for the physics engine to register the collision between the
    // player and the newly created light (isColliding() needs a frame).
    await page.waitForFunction(
      () => window.player.isColliding(window.testLight),
      { timeout: 5000 }
    );

    // 1. The light starts OFF.
    const initialOn = await page.evaluate(() => window.testLight.lightOn);
    if (initialOn !== false) {
      fail(`Light should start OFF, got lightOn=${initialOn}`);
    }
    console.log('PASS: Light starts OFF');

    // 2. The light is registered with the lighting system (has an intensity).
    const registered = await page.evaluate(
      () => typeof window.testLight.intensity === 'number'
    );
    if (!registered) {
      fail('Light is not registered with the lighting system');
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
      fail('Lighting overlay canvas not found in DOM');
    }
    if (overlayInfo.width !== 800 || overlayInfo.height !== 600) {
      fail(`Overlay canvas wrong size, got ${overlayInfo.width}x${overlayInfo.height}`);
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
      fail('Could not read overlay pixels (light OFF)');
    }
    if (Math.abs(offFar - DARK_ALPHA) > TOL || Math.abs(offNear - DARK_ALPHA) > TOL) {
      fail(
        `With light OFF, scene should be uniformly dark (~${DARK_ALPHA}); ` +
          `got far=${offFar}, near=${offNear}`
      );
    }
    console.log('PASS: With light OFF, scene is uniformly dark');

    // 5. Press 'e' to toggle the light ON, then wait for the 0.2s fade to
    //    complete before sampling pixels.
    await page.keyboard.press('e');
    await sleep(350);
    const onAfterFirst = await page.evaluate(() => window.testLight.lightOn);
    if (onAfterFirst !== true) {
      fail(`Light should be ON after first toggle, got lightOn=${onAfterFirst}`);
    }
    console.log('PASS: Light toggles ON');

    // 6. With the light ON, the far corner stays dark but the point near the
    //    light is brightened (its overlay alpha is significantly reduced).
    const onFar = await readOverlayAlpha(page, farX, farY);
    const onNear = await readOverlayAlpha(page, nearX, nearY);
    if (onFar === null || onNear === null) {
      fail('Could not read overlay pixels (light ON)');
    }
    if (Math.abs(onFar - DARK_ALPHA) > TOL) {
      fail(`With light ON, far corner should stay dark (~${DARK_ALPHA}); got ${onFar}`);
    }
    if (onNear > DARK_ALPHA - 40) {
      fail(
        `With light ON, point near the light should be brightened ` +
          `(alpha < ${DARK_ALPHA - 40}); got ${onNear}`
      );
    }
    console.log('PASS: With light ON, area near the light is brightened');

    // 7. Press 'e' again to toggle the light OFF.
    await page.keyboard.press('e');
    await sleep(350);
    const onAfterSecond = await page.evaluate(() => window.testLight.lightOn);
    if (onAfterSecond !== false) {
      fail(`Light should be OFF after second toggle, got lightOn=${onAfterSecond}`);
    }
    console.log('PASS: Light toggles OFF');

    // 8. After toggling OFF, the scene returns to uniform darkness.
    const offAgainNear = await readOverlayAlpha(page, nearX, nearY);
    if (offAgainNear === null) {
      fail('Could not read overlay pixels (light OFF again)');
    }
    if (Math.abs(offAgainNear - DARK_ALPHA) > TOL) {
      fail(
        `After toggling OFF, scene should return to uniform darkness ` +
          `(~${DARK_ALPHA}); got near=${offAgainNear}`
      );
    }
    console.log('PASS: After toggling OFF, scene returns to uniform darkness');

    console.log('All environment/light tests passed');
  },
};
