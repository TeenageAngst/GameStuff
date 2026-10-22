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
//   5. Axis-aligned lights silhouette 2 box corners, diagonal lights 3;
//      every remaining vertex sits on the SHADOW_MAX_DIST arc between the
//      tangent rays (a chord would cut across wide cones).
//   6. Casters beyond SHADOW_MAX_DIST produce no shadow.
//
// All geometry runs in the browser via a single page.evaluate that imports
// the pure ES module /src/shadowGeometry.js (served by the dev server).

module.exports = {
  async run(page) {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('canvas');

    const results = await page.evaluate(async () => {
      const {
        computeShadowPolygon,
        computeAnnularSectorShadow,
        SHADOW_MAX_DIST,
      } = await import('/src/shadowGeometry.js');

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
        // Structural facts for the far-cap arc: leading vertices must be
        // box corners (the far-side silhouette); every remaining vertex
        // must sit on the SHADOW_MAX_DIST circle around the light (the
        // arc-sampled far cap — a chord would cut across wide cones).
        const boxCorners = [
          { x: box.x, y: box.y },
          { x: box.x + box.w, y: box.y },
          { x: box.x + box.w, y: box.y + box.h },
          { x: box.x, y: box.y + box.h },
        ];
        let silhouetteLen = 0;
        for (const p of poly) {
          const onCorner = boxCorners.some(
            (c) => Math.hypot(c.x - p.x, c.y - p.y) < 0.001
          );
          if (!onCorner) break;
          silhouetteLen++;
        }
        const arcOnCircle = poly
          .slice(silhouetteLen)
          .every(
            (p) =>
              Math.abs(Math.hypot(p.x - lx, p.y - ly) - SHADOW_MAX_DIST) < 0.01
          );
        return {
          poly,
          vertexCount: poly.length,
          area: polyArea(poly),
          centerInside: pointInPoly(bcx, bcy, poly),
          behindInside: pointInPoly(behindX, behindY, poly),
          silhouetteLen,
          arcOnCircle,
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

      // --- Annular sector (light director housing) ---
      // A ring centered at the origin with a 40° aperture centered on the
      // +x axis (solid part spans [20°, 340°]). The light sits at the ring's
      // center, so the shadow must be exactly the solid wedge: points inside
      // the solid arc are shadowed, points inside the aperture are not.
      const sector = {
        cx: 0,
        cy: 0,
        rIn: 26,
        rOut: 34,
        a0: (20 * Math.PI) / 180,
        a1: (340 * Math.PI) / 180,
      };
      const sectorResult = computeAnnularSectorShadow(0, 0, sector);
      const sectorPoly = sectorResult ? sectorResult.poly : null;

      // Sample points at radius 60 (outside the ring) at key angles.
      function sectorPointAt(deg) {
        const rad = (deg * Math.PI) / 180;
        return {
          x: 60 * Math.cos(rad),
          y: 60 * Math.sin(rad),
        };
      }
      const solidAngles = [30, 90, 180, 270, 330]; // inside the solid arc
      const apertureAngles = [0, 10, -10]; // inside the 40° aperture
      const sectorSolidInside = solidAngles.map((d) => {
        const p = sectorPointAt(d);
        return pointInPoly(p.x, p.y, sectorPoly);
      });
      const sectorApertureInside = apertureAngles.map((d) => {
        const p = sectorPointAt(d);
        return pointInPoly(p.x, p.y, sectorPoly);
      });

      // Rotated sector: the same ring spun 90° (aperture now faces south).
      const rotatedSector = {
        ...sector,
        a0: sector.a0 + Math.PI / 2,
        a1: sector.a1 + Math.PI / 2,
      };
      const rotatedResult = computeAnnularSectorShadow(0, 0, rotatedSector);
      const rotatedPoly = rotatedResult ? rotatedResult.poly : null;
      // After a 90° rotation, the aperture (was at 0°) is at 90°.
      const rotatedApertureInside = pointInPoly(
        sectorPointAt(90).x,
        sectorPointAt(90).y,
        rotatedPoly
      );
      const rotatedSolidInside = pointInPoly(
        sectorPointAt(180).x,
        sectorPointAt(180).y,
        rotatedPoly
      );

      // Beyond SHADOW_MAX_DIST: no shadow.
      const sectorTooFar = computeAnnularSectorShadow(
        SHADOW_MAX_DIST + 100,
        0,
        sector
      );

      // --- Exterior light (e.g. the green lamp 175px west of the housing).
      // The sector wedge is only valid for a light at the ring's center; for
      // any other light the shadow must be a simple polygon that never covers
      // the light's own position (regression test: a malformed exterior
      // shadow once swallowed the green lamp's light entirely).
      const extResult = computeAnnularSectorShadow(-175, 0, sector);
      const extPoly = extResult ? extResult.poly : null;
      const extLightInside = extPoly ? pointInPoly(-175, 0, extPoly) : null;
      // Behind the ring (away from the light) must still be shadowed.
      const extBehindInside = extPoly ? pointInPoly(80, 0, extPoly) : null;
      // The ring's interior sits behind its walls from any exterior light, so
      // it must be shadowed too (no light leaking inside the enclosure).
      // (Aperture faces away here: light west, aperture east.)
      const extInteriorInside = extPoly ? pointInPoly(0, 0, extPoly) : null;
      // --- Exterior light with the aperture FACING it (light east at 175,0,
      // aperture east). The shaft through the aperture must stay lit.
      const faceResult = computeAnnularSectorShadow(175, 0, sector);
      const facePoly = faceResult ? faceResult.poly : null;
      // Shaft point (in the interior along the aperture direction) must NOT
      // be shadowed — light enters through the hole.
      const faceShaftLit = facePoly ? !pointInPoly(10, 0, facePoly) : null;
      // Off-shaft interior must still be shadowed.
      const faceOffShaftDark = facePoly ? pointInPoly(0, 15, facePoly) : null;
      // No self-intersections in the notched polygon.
      let faceCrossings = 0;
      if (facePoly) {
        for (let i = 0; i < facePoly.length; i++) {
          for (let j = i + 1; j < facePoly.length; j++) {
            const p1 = facePoly[i], p2 = facePoly[(i + 1) % facePoly.length];
            const p3 = facePoly[j], p4 = facePoly[(j + 1) % facePoly.length];
            if (p1 === p3 || p1 === p4 || p2 === p3 || p2 === p4) continue;
            if (segsCross(p1, p2, p3, p4)) faceCrossings++;
          }
        }
      }
      // Simplicity: no edge may cross another non-adjacent edge.
      function segsCross(p1, p2, p3, p4) {
        const d =
          (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
        if (!d) return false;
        const t =
          ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
        const u =
          ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
        return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
      }
      let extCrossings = 0;
      if (extPoly) {
        for (let i = 0; i < extPoly.length; i++) {
          for (let j = i + 1; j < extPoly.length; j++) {
            const a1 = extPoly[i],
              a2 = extPoly[(i + 1) % extPoly.length],
              b1 = extPoly[j],
              b2 = extPoly[(j + 1) % extPoly.length];
            if (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) continue;
            if (segsCross(a1, a2, b1, b2)) extCrossings++;
          }
        }
      }

      return {
        perAngle,
        axisAngles,
        diagAngles,
        maxJump,
        meanArea,
        tooFar: tooFar === null ? null : 'non-null',
        sectorPoly: sectorPoly ? sectorPoly.length : null,
        sectorSolidInside,
        sectorApertureInside,
        rotatedApertureInside,
        rotatedSolidInside,
        sectorTooFar: sectorTooFar === null ? null : 'non-null',
        extLightInside,
        extBehindInside,
        extInteriorInside,
        extCrossings,
        faceShaftLit,
        faceOffShaftDark,
        faceCrossings,
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
      const expectedSil = results.axisAngles.includes(deg) ? 2 : 3;
      if (r.silhouetteLen !== expectedSil) {
        fail(
          `Wrong silhouette at angle ${deg}°: got ${r.silhouetteLen} box-corner ` +
            `vertices, expected ${expectedSil}`
        );
      }
      if (!r.arcOnCircle) {
        fail(
          `Far-cap vertices are not on the SHADOW_MAX_DIST arc at angle ${deg}°`
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

    // --- 7: annular sector (light director) shadow is the exact solid wedge.
    if (results.sectorPoly === null) {
      fail('Annular sector produced no shadow polygon');
    }
    if (results.sectorSolidInside.some((inside) => !inside)) {
      fail(
        'Annular sector shadow does not cover the solid arc ' +
          `(solid points inside: ${results.sectorSolidInside.join(',')})`
      );
    }
    if (results.sectorApertureInside.some((inside) => inside)) {
      fail(
        'Annular sector shadow leaks through the aperture ' +
          `(aperture points inside: ${results.sectorApertureInside.join(',')})`
      );
    }
    console.log(
      'PASS: Annular sector shadow covers the solid arc and leaves the aperture open'
    );

    // --- 8: rotating the sector rotates the shadow (aperture follows).
    // After a +90° rotation the aperture (was at 0°) is at 90°, so a point
    // at 90° must be OUTSIDE the shadow polygon (aperture is open).
    if (results.rotatedApertureInside) {
      fail('Rotated annular sector: aperture is blocked after 90° rotation');
    }
    if (!results.rotatedSolidInside) {
      fail('Rotated annular sector: solid arc no longer shadowed after 90° rotation');
    }
    console.log('PASS: Rotating the annular sector rotates its shadow');

    // --- 9: sector beyond SHADOW_MAX_DIST produces no shadow.
    if (results.sectorTooFar !== null) {
      fail('Annular sector beyond SHADOW_MAX_DIST should not cast a shadow');
    }
    console.log('PASS: Annular sectors beyond SHADOW_MAX_DIST do not cast a shadow');

    // --- 10: exterior light is never inside its own sector shadow, and the
    // shadow polygon is simple.
    if (results.extLightInside) {
      fail('Exterior light is inside its own annular-sector shadow (green lamp regression)');
    }
    if (!results.extBehindInside) {
      fail('Exterior annular-sector shadow does not cover the region behind the ring');
    }
    if (!results.extInteriorInside) {
      fail('Exterior annular-sector shadow does not cover the ring interior (light leaks inside the enclosure)');
    }
    if (results.extCrossings !== 0) {
      fail(
        `Exterior annular-sector shadow is self-intersecting (${results.extCrossings} crossings)`
      );
    }
    console.log('PASS: Exterior annular-sector shadow is simple and never covers its light');

    // --- 11: aperture facing the light lets the shaft through.
    if (!results.faceShaftLit) {
      fail('Aperture-facing exterior shadow blocks the light shaft (hole does not admit light)');
    }
    if (!results.faceOffShaftDark) {
      fail('Aperture-facing exterior shadow does not cover off-shaft interior');
    }
    if (results.faceCrossings !== 0) {
      fail(
        `Aperture-facing exterior shadow is self-intersecting (${results.faceCrossings} crossings)`
      );
    }
    console.log('PASS: Aperture-facing exterior shadow admits the light shaft');

    console.log('All shadow geometry tests passed');
  },
};
