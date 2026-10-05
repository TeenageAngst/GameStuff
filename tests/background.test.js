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

    // Wait for assets / background to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 1. The old static background sprite must be gone
    const oldSpriteGone = await page.evaluate(() => {
      if (!window.k) return false;
      return !window.k.get().some(obj => {
        const sprite = obj.sprite || (obj.get && obj.get('sprite'));
        if (!sprite) return false;
        if (typeof sprite === 'string') return sprite === 'background';
        if (sprite.name) return sprite.name === 'background';
        return false;
      });
    });
    if (oldSpriteGone) {
      console.log('PASS: Old static background sprite removed');
    } else {
      console.error('FAIL: Old static background sprite still present');
      process.exit(1);
    }

    // 2. Nebulae exist (4-6), tagged, with z(-100)
    const nebulae = await page.evaluate(() => {
      if (!window.k) return [];
      return window.k.get().filter(obj => obj.bgNebula).map(obj => ({
        z: obj.z,
        opacity: obj.opacity,
        pos: { x: obj.pos.x, y: obj.pos.y },
      }));
    });
    if (nebulae.length >= 4 && nebulae.length <= 6) {
      console.log(`PASS: ${nebulae.length} nebulae present`);
    } else {
      console.error(`FAIL: Expected 4-6 nebulae, got ${nebulae.length}`);
      process.exit(1);
    }

    // 3. Particles exist (50-100), tagged, with z(-90)
    const particles = await page.evaluate(() => {
      if (!window.k) return [];
      return window.k.get().filter(obj => obj.bgParticle).map(obj => ({
        z: obj.z,
        opacity: obj.opacity,
      }));
    });
    if (particles.length >= 50 && particles.length <= 100) {
      console.log(`PASS: ${particles.length} particles present`);
    } else {
      console.error(`FAIL: Expected 50-100 particles, got ${particles.length}`);
      process.exit(1);
    }

    // 4. Z-layering: nebulae z(-100), particles z(-90)
    const zOk = nebulae.every(n => n.z === -100) && particles.every(p => p.z === -90);
    if (zOk) {
      console.log('PASS: Z-layering correct (nebulae -100, particles -90)');
    } else {
      console.error('FAIL: Z-layering incorrect');
      process.exit(1);
    }

    // 5. Twinkle: particle opacity changes over time (sample 3 times)
    const sampleOpacity = () => page.evaluate(() => {
      const p = window.k.get().find(obj => obj.bgParticle);
      return p ? p.opacity : null;
    });
    const op1 = await sampleOpacity();
    await new Promise(resolve => setTimeout(resolve, 250));
    const op2 = await sampleOpacity();
    await new Promise(resolve => setTimeout(resolve, 250));
    const op3 = await sampleOpacity();
    const twinkles = [op1, op2, op3].some(o => o !== op1);
    if (op1 !== null && twinkles) {
      console.log('PASS: Particles twinkle (opacity changes over time)');
    } else {
      console.error(`FAIL: Particles do not twinkle (op1=${op1}, op2=${op2}, op3=${op3})`);
      process.exit(1);
    }

    // 6. Parallax: moving the player shifts the background; particles shift more than nebulae
    await page.evaluate(() => { window.player.pos.x = 400; window.player.pos.y = 300; });
    await new Promise(resolve => setTimeout(resolve, 200));
    const before = await page.evaluate(() => {
      const n = window.k.get().find(obj => obj.bgNebula);
      const p = window.k.get().find(obj => obj.bgParticle);
      return { nx: n.pos.x, px: p.pos.x };
    });
    await page.evaluate(() => { window.player.pos.x += 200; });
    await new Promise(resolve => setTimeout(resolve, 300));
    const after = await page.evaluate(() => {
      const n = window.k.get().find(obj => obj.bgNebula);
      const p = window.k.get().find(obj => obj.bgParticle);
      return { nx: n.pos.x, px: p.pos.x };
    });
    const nebulaShift = after.nx - before.nx;
    const particleShift = after.px - before.px;
    if (particleShift > nebulaShift && particleShift > 0) {
      console.log(`PASS: Parallax (particleShift=${particleShift.toFixed(1)} > nebulaShift=${nebulaShift.toFixed(1)})`);
    } else {
      console.error(`FAIL: Parallax incorrect (nebulaShift=${nebulaShift}, particleShift=${particleShift})`);
      process.exit(1);
    }

    // 7. Wrap-around: teleport a nebula's base position well past the right edge;
    //    it should reappear on the left side (no popping, smooth re-entry).
    //    Use a large offset + waitForFunction so the test is robust to frame rate.
    await page.evaluate(() => {
      const n = window.k.get().find(obj => obj.bgNebula);
      n.baseX = window.k.width() + 400; // well past the wrap threshold (W + BUFFER = 1100)
    });
    await page.waitForFunction(() => {
      const n = window.k.get().find(obj => obj.bgNebula);
      return n.baseX <= 0; // wrapped to the left side
    }, { timeout: 5000 });
    const wrapBaseX = await page.evaluate(() => {
      const n = window.k.get().find(obj => obj.bgNebula);
      return n.baseX;
    });
    if (wrapBaseX <= 0) {
      console.log(`PASS: Wrap-around (nebula re-entered at baseX=${wrapBaseX.toFixed(1)})`);
    } else {
      console.error(`FAIL: Wrap-around did not trigger (baseX=${wrapBaseX})`);
      process.exit(1);
    }

    // 8. Pool stability: object counts must stay constant (no runtime allocation/GC spikes)
    const countBefore = await page.evaluate(() => {
      const objs = window.k.get();
      return {
        nebulae: objs.filter(o => o.bgNebula).length,
        particles: objs.filter(o => o.bgParticle).length,
      };
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    const countAfter = await page.evaluate(() => {
      const objs = window.k.get();
      return {
        nebulae: objs.filter(o => o.bgNebula).length,
        particles: objs.filter(o => o.bgParticle).length,
      };
    });
    if (countBefore.nebulae === countAfter.nebulae && countBefore.particles === countAfter.particles) {
      console.log(`PASS: Pool stable (nebulae=${countAfter.nebulae}, particles=${countAfter.particles} unchanged over 1s)`);
    } else {
      console.error(`FAIL: Pool not stable (before=${JSON.stringify(countBefore)}, after=${JSON.stringify(countAfter)})`);
      process.exit(1);
    }

    // 9. Performance: measure FPS over 1s; must hold a playable frame rate with 100+ objects
    const fps = await page.evaluate(async () => {
      let frames = 0;
      const start = performance.now();
      await new Promise((resolve) => {
        function tick() {
          frames++;
          if (performance.now() - start < 1000) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      return frames; // ~1000ms elapsed, so frames ≈ FPS
    });
    if (fps >= 30) {
      console.log(`PASS: Performance (${fps} FPS with ${countAfter.nebulae + countAfter.particles} background objects)`);
    } else {
      console.error(`FAIL: Performance too low (${fps} FPS)`);
      process.exit(1);
    }

    // 10. Integration: game objects (interactables) exist and render on top of the background.
    //     Objects without an explicit k.z() component render at the default z of 0.
    const integration = await page.evaluate(() => {
      const zOf = (o) => (typeof o.z === 'number' ? o.z : 0);
      const objs = window.k.get();
      const interactables = objs.filter(o => o.is('interactable'));
      const bgMaxZ = Math.max(
        ...objs.filter(o => o.bgNebula || o.bgParticle).map(zOf)
      );
      const gameMinZ = interactables.length ? Math.min(...interactables.map(zOf)) : null;
      return { interactableCount: interactables.length, bgMaxZ, gameMinZ };
    });
    if (integration.interactableCount > 0 && integration.gameMinZ > integration.bgMaxZ) {
      console.log(`PASS: Integration (${integration.interactableCount} game objects on top; gameZ=${integration.gameMinZ} > bgZ=${integration.bgMaxZ})`);
    } else {
      console.error(`FAIL: Integration incorrect (interactables=${integration.interactableCount}, gameZ=${integration.gameMinZ}, bgZ=${integration.bgMaxZ})`);
      process.exit(1);
    }

    console.log('ALL BACKGROUND TESTS PASSED');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
    server.kill();
  }
})();
