const { fail } = require('./harness');

// Locks in the playtest-confirmed shadow behavior:
//   1. A shadow exists at EVERY light angle (including all four diagonals)
//      and is non-degenerate (the original bug: diagonal shadows vanished).
//   2. The shadow starts at the box's far-side boundary, so the caster's
//      body stays lit (the box center is NOT inside the shadow polygon).
//   3. The shadow extends away from the light (a point behind the box,
//      along the light->box direction, IS inside the polygon).
//   4. The shadow is continuous as the light direction rotates (no "popping"
//      when orbiting the light): the polygon area changes smoothly between
//      adjacent angles.
//   5. Axis-aligned lights produce a 4-vertex trapezoid; diagonal lights
//      produce a 5-vertex pentagon.
//   6. Casters beyond SHADOW_MAX_DIST produce no shadow.
//
// All geometry runs in the browser via a single page.evaluate that imports
// the pure ES module /src/shadowGeometry.js (served by the dev server).

module.exports = {
  async run(page) {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');

    const results = await page.evaluate(async () => {
      const { computeShadowPolygon, SHADOW_MAX_DIST } = await import(
        '/src/shadowGeometry.js'
      );

      // Ray-casting point-in-polygon test.
      function pointInPoly(px, py, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].x, yi = poly[i].y;
          const xj = poly[j].x, yj = poly[j].y;
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside;
          }
        }
        return inside;
      }

      // Shoelace polygon area.
      function polyArea(poly) {
        let area = 0;
        for (let i = 0; i < poly.length; i++) {
          const j = (i + 1) % poly.length;
          area += poly[i].x * poly[j].y;
          area -= poly[j].x * poly[i].y;
        }
        return Math.abs(area) / 2;
      }

      // A 32x32 box (player-sized) at a fixed position.
      const box = { x: 100, y: 100, w: 32, h: 32 };
      const bcx = box.x + box.w / 2;
      const bcy = box.y + box.h / 2;
      const lightDist = 100; // well within SHADOW_MAX_DIST

      // Place the light at `deg` degrees around the box center and compute
      // the shadow polygon plus helper facts.
      function computeAt(deg) {
        const rad = (deg * Math.PI) / 180;
        // Light sits at angle `deg` as seen from the box center.
        const lx = bcx - lightDist * Math.cos(rad);
        const ly = bcy - lightDist * Math.sin(rad);
        const result = computeShadowPolygon(lx, ly, box);
        if (!result) return null;
        const { poly } = result;
        // A point behind the box, 50px past the far edge, along the
        // light->box-center direction.
        const dx = bcx - lx;
        const dy = bcy - ly;
        const d = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / d;
        const uy = dy / d;
        const behindX = bcx + ux * 50;
        const behindY = bcy + uy * 50;
        return {
          poly,
          vertexCount: poly.length,
          area: polyArea(poly),
          centerInside: pointInPoly(bcx, bcy, poly),
          behindInside: pointInPoly(behindX, behindY, poly),
        };
      }

      const axisAngles = [0, 90, 180, 270];
      const diagAngles = [45, 135, 225, 315];
      const allAngles = [0, 45, 90, 135, 180, 225, 270, 315];

      const perAngle = {};
      for (const deg of allAngles) {
        perAngle[deg] = computeAt(deg);
      }

      // Continuity: sample 36 angles around the light, collect areas.
      const orbitAreas = [];
      for (let deg = 0; deg < 360; deg += 10) {
        const r = computeAt(deg);
        if (!r) return { error: `No shadow polygon at orbit angle ${deg}°` };
        orbitAreas.push(r.area);
      }
      let maxJump = 0;
      for (let i = 0; i < orbitAreas.length; i++) {
        const next = (i + 1) % orbitAreas.length;
        const jump = Math.abs(orbitAreas[next] - orbitAreas[i]);
        if (jump > maxJump) maxJump = jump;
      }
      const meanArea =
        orbitAreas.reduce((a, b) => a + b, 0) / orbitAreas.length;

      // Beyond SHADOW_MAX_DIST: no shadow.
      const tooFar = computeShadowPolygon(
        bcx - (SHADOW_MAX_DIST + 100),
        bcy,
        box
      );

      return {
        perAngle,
        axisAngles,
        diagAngles,
        maxJump,
        meanArea,
        tooFar: tooFar === null ? null : 'non-null',
      };
    });

    if (results.error) fail(results.error);

    // --- 1 & 5: shadow exists at every angle, non-degenerate, correct shape.
    for (const deg of [...results.axisAngles, ...results.diagAngles]) {
      const r = results.perAngle[deg];
      if (!r) fail(`No shadow polygon at angle ${deg}° (shadow vanished)`);
      if (r.area < 1000) {
        fail(`Degenerate shadow at angle ${deg}° (area=${r.area.toFixed(0)})`);
      }
      const expectedVerts = results.axisAngles.includes(deg) ? 4 : 5;
      if (r.vertexCount !== expectedVerts) {
        fail(
          `Wrong polygon shape at angle ${deg}°: got ${r.vertexCount} vertices, ` +
            `expected ${expectedVerts}`
        );
      }
    }
    console.log(
      'PASS: Shadow exists and is non-degenerate at all 8 cardinal/diagonal angles'
    );

    // --- 2: the caster's body stays lit (box center not in the shadow).
    for (const deg of Object.keys(results.perAngle).map(Number)) {
      const r = results.perAngle[deg];
      if (r.centerInside) {
        fail(`Caster body covered by its own shadow at angle ${deg}°`);
      }
    }
    console.log(
      'PASS: Caster body stays lit (box center outside shadow) at all angles'
    );

    // --- 3: the shadow extends away from the light.
    for (const deg of Object.keys(results.perAngle).map(Number)) {
      const r = results.perAngle[deg];
      if (!r.behindInside) {
        fail(`Shadow does not extend away from the light at angle ${deg}°`);
      }
    }
    console.log('PASS: Shadow extends away from the light at all angles');

    // --- 4: continuity while orbiting (no popping).
    if (results.maxJump > results.meanArea * 0.15) {
      fail(
        `Shadow "pops" while orbiting: max area jump between adjacent 10° steps ` +
          `is ${results.maxJump.toFixed(0)} (mean area ${results.meanArea.toFixed(0)})`
      );
    }
    console.log(
      `PASS: Shadow is continuous while orbiting (max 10° area jump ` +
        `${results.maxJump.toFixed(0)}, mean area ${results.meanArea.toFixed(0)})`
    );

    // --- 6: casters beyond SHADOW_MAX_DIST produce no shadow.
    if (results.tooFar !== null) {
      fail('Caster beyond SHADOW_MAX_DIST should not cast a shadow');
    }
    console.log('PASS: Casters beyond SHADOW_MAX_DIST do not cast a shadow');

    console.log('All shadow geometry tests passed');
  },
};
