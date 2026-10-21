// Pure shadow geometry: computes the shadow polygon for an axis-aligned
// caster box relative to a point light. No DOM or game dependencies, so it
// can be unit-tested directly (see tests/shadow.test.js).
//
// The shadow is the region behind the caster (away from the light) that the
// light cannot reach. It is a cone that:
//   - Starts at the box's far-side silhouette (the part of the box perimeter
//     facing away from the light), so the caster's body stays lit.
//   - Extends outward, bounded by the two tangent rays from the light to
//     the box (the rays that just graze the box).
//
// The construction is continuous for all light angles: as the light
// direction rotates, the far-side silhouette and the tangent corners change
// smoothly (they only swap at exact axis alignments, where the polygon shape
// is identical either way), so the shadow does not "pop" as the caster
// orbits the light.

export const SHADOW_MAX_DIST = 1200; // max distance a caster can be from a light to cast

export function computeShadowPolygon(lx, ly, box, maxDist = SHADOW_MAX_DIST, angle = 0) {
    const left = box.x;
    const right = box.x + box.w;
    const top = box.y;
    const bottom = box.y + box.h;
    const bcx = (left + right) / 2;
    const bcy = (top + bottom) / 2;
    const dx = bcx - lx;
    const dy = bcy - ly;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Cull on the nearest point of the box, not its center: a huge box
    // (like a 4000px hallway wall) can be far at its center yet right next
    // to the light at its edge. Culling on the center lets light leak past
    // the near portions of long walls.
    const nx = Math.max(left, Math.min(lx, right));
    const ny = Math.max(top, Math.min(ly, bottom));
    const ndx = lx - nx;
    const ndy = ly - ny;
    const nearDist0 = Math.sqrt(ndx * ndx + ndy * ndy);
    if (nearDist0 < 0.001 || nearDist0 > maxDist) return null;
    const D = { x: dx / dist, y: dy / dist }; // unit vector light -> box center

    // Rotate a point (or vector) around the box center by `angle` (radians).
    // When angle is 0 this is the identity, so axis-aligned boxes behave
    // exactly as before.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    function rotPt(p) {
        const vx = p.x - bcx;
        const vy = p.y - bcy;
        return { x: bcx + vx * cos - vy * sin, y: bcy + vx * sin + vy * cos };
    }
    function rotVec(v) {
        return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
    }

    // The four box corners (rotated around the box center if the box is
    // rotated).
    const TL = rotPt({ x: left, y: top });
    const TR = rotPt({ x: right, y: top });
    const BR = rotPt({ x: right, y: bottom });
    const BL = rotPt({ x: left, y: bottom });
    const corners = [TL, TR, BR, BL];

    // Find the two tangent corners (min/max angle from the light). These are
    // the corners the light's tangent rays graze; they define the angular
    // extent of the shadow cone.
    const baseAngle = Math.atan2(bcy - ly, bcx - lx);
    let minRel = Infinity;
    let maxRel = -Infinity;
    let tanNear1 = TL; // tangent corner with min relative angle
    let tanNear2 = TL; // tangent corner with max relative angle
    for (const c of corners) {
        const abs = Math.atan2(c.y - ly, c.x - lx);
        let rel = abs - baseAngle;
        while (rel > Math.PI) rel -= 2 * Math.PI;
        while (rel < -Math.PI) rel += 2 * Math.PI;
        if (rel < minRel) { minRel = rel; tanNear1 = c; }
        if (rel > maxRel) { maxRel = rel; tanNear2 = c; }
    }

    // Find the far-side silhouette: the chain of box edges whose outward
    // normals have positive dot product with D (facing away from the light).
    //
    // The box edges in order (clockwise): TL->TR (top), TR->BR (right),
    // BR->BL (bottom), BL->TL (left).
    const edges = [
        { a: TL, b: TR, n: rotVec({ x: 0, y: -1 }) }, // top
        { a: TR, b: BR, n: rotVec({ x: 1, y: 0 }) },  // right
        { a: BR, b: BL, n: rotVec({ x: 0, y: 1 }) },  // bottom
        { a: BL, b: TL, n: rotVec({ x: -1, y: 0 }) }, // left
    ];

    // Collect edges facing away from the light (dot > 0).
    const farEdges = [];
    for (const e of edges) {
        const dot = e.n.x * D.x + e.n.y * D.y;
        if (dot > 0.001) farEdges.push(e);
    }

    // The far-side silhouette is the chain of farEdges. For an axis-aligned
    // light, there's exactly one far edge. For a diagonal light, there are
    // two adjacent far edges meeting at the far corner.
    //
    // Order the farEdges so they form a continuous chain (each edge's
    // endpoint matches the next edge's startpoint).
    let silhouette;
    if (farEdges.length === 1) {
        silhouette = [farEdges[0].a, farEdges[0].b];
    } else if (farEdges.length === 2) {
        // Find the shared corner (the far corner) and order the chain.
        const e0 = farEdges[0];
        const e1 = farEdges[1];
        // Check if e0.b === e1.a (they share e0.b/e1.a as the far corner).
        if (e0.b.x === e1.a.x && e0.b.y === e1.a.y) {
            silhouette = [e0.a, e0.b, e1.b];
        } else {
            // e1.b === e0.a (they share e1.b/e0.a as the far corner).
            silhouette = [e1.a, e1.b, e0.b];
        }
    } else {
        // Should not happen for a convex box, but fall back to the single
        // most-aligned edge.
        let best = edges[0];
        let bestDot = -Infinity;
        for (const e of edges) {
            const dot = e.n.x * D.x + e.n.y * D.y;
            if (dot > bestDot) { bestDot = dot; best = e; }
        }
        silhouette = [best.a, best.b];
    }

    // Project a point outward from the light to the shadow boundary.
    // The far cap must lie beyond the caster along the ray. If the corner
    // itself is past maxDist, extend past the corner instead of collapsing
    // inward to maxDist — an inward cap would paint shadow between the
    // light and the caster, darkening lit ground (this bit the 4000px
    // hallway walls, whose far corners are ~2000px from the lamps).
    function project(pt) {
        const vx = pt.x - lx;
        const vy = pt.y - ly;
        const len = Math.sqrt(vx * vx + vy * vy);
        if (len < 0.001) return { x: pt.x, y: pt.y };
        const target = len > maxDist ? len + maxDist : maxDist;
        const t = target / len;
        return { x: lx + vx * t, y: ly + vy * t };
    }

    // The shadow polygon: silhouette[0] -> silhouette[1] -> ... ->
    // silhouette[n] -> project(tanNear2) -> project(tanNear1).
    //
    // The near boundary is the far-side silhouette (so the caster's body
    // stays lit). The two sides of the shadow cone follow the tangent rays
    // from the light through the tangent corners (tanNear1 and tanNear2).
    // The far boundary connects the two projected tangent corners.
    const p1 = project(tanNear1);
    const p2 = project(tanNear2);

    const poly = [...silhouette, p2, p1];

    // Near/far distances from the light to the box (for the gradient).
    const nearDist = dist - Math.max(box.w, box.h) / 2;
    const farDist = dist + Math.max(box.w, box.h) / 2;

    return { poly, nearDist: Math.max(0, nearDist), farDist };
}

// Computes the shadow polygon for an annular sector (a ring segment) relative
// to a point light. The sector is defined by its center (cx, cy), inner
// radius rIn, outer radius rOut, and angular span [a0, a1] in radians (the
// solid part of the ring; the aperture is the complementary gap).
//
// Three cases, dispatched on the light's distance from the sector center:
//
// 1. Interior light (dist < rIn, e.g. the lamp inside the light director):
//    the shadow is the angular wedge [a0, a1] extending from rOut to maxDist.
//    Near boundary: arc at rOut from a0 to a1. Far boundary: arc at maxDist
//    from a1 back to a0. Both arcs sampled at ARC_STEPS points. The wedge is
//    exact because the light is at the sector's center.
//
// 2. Exterior light, aperture facing away: the ring is a solid occluder from
//    outside — its interior sits behind its walls. The shadow is the
//    tangent-ray shadow of the outer circle (disc): near arc facing the light
//    between the tangent points, tangent rays extended to maxDist, far arc
//    closing the cone. This covers the disc interior plus the shadow behind
//    it, so no light leaks inside the enclosure.
//
// 3. Exterior light, aperture facing the light: as case 2, but with a notch
//    cut out for the light shaft through the aperture. The near boundary
//    follows the outer arc, dips in through the aperture along the light rays
//    to the far inner edge, crosses at rIn, and comes back out. The shaft
//    stays lit; off-shaft interior stays shadowed.
//
// `sector` is { cx, cy, rIn, rOut, a0, a1 }.
// Returns { poly, nearDist, farDist } or null if the sector is too far away.
export function computeAnnularSectorShadow(lx, ly, sector, maxDist = SHADOW_MAX_DIST) {
    const { cx, cy, rIn, rOut, a0, a1 } = sector;

    const dx = cx - lx;
    const dy = cy - ly;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) return null;

    const ARC_STEPS = 24;
    const poly = [];

    // Check if the light is at the sector's center (within the inner radius).
    // If so, use the simple angular wedge.
    if (dist < rIn) {
        // The shadow is the angular wedge [a0, a1] extending from rOut to maxDist.
        // Near boundary: arc at rOut from a0 to a1.
        for (let i = 0; i <= ARC_STEPS; i++) {
            const a = a0 + (a1 - a0) * (i / ARC_STEPS);
            poly.push({ x: cx + rOut * Math.cos(a), y: cy + rOut * Math.sin(a) });
        }

        // Far boundary: arc at maxDist from a1 back to a0.
        for (let i = 0; i <= ARC_STEPS; i++) {
            const a = a1 - (a1 - a0) * (i / ARC_STEPS);
            poly.push({ x: cx + maxDist * Math.cos(a), y: cy + maxDist * Math.sin(a) });
        }

        return {
            poly,
            nearDist: rOut - dist,
            farDist: maxDist,
        };
    }

    // Light is elsewhere (e.g. another lamp across the room): the wedge above
    // is only valid for a light at the sector's center. From outside, the ring
    // is a solid occluder — its interior sits behind its walls, so the shadow
    // must cover the interior too, not just the region behind the ring.
    //
    // However, the aperture (gap) lets light through: if the aperture faces
    // the light, a shaft of light passes through the gap into the interior.
    // The shadow polygon gets a notch excluding this shaft.
    //
    // a0/a1 are the SOLID arc's bounds; the aperture is [a1, a0 + 2π].
    const dirToLight = Math.atan2(ly - cy, lx - cx); // center -> light
    const halfAngle = Math.acos(Math.min(1, rOut / dist));
    const t1 = dirToLight - halfAngle;
    const t2 = dirToLight + halfAngle;

    // Aperture interval, normalized to be near dirToLight.
    let ap0 = a1, ap1 = a0 + 2 * Math.PI;
    while (ap0 < dirToLight - Math.PI) { ap0 += 2 * Math.PI; ap1 += 2 * Math.PI; }
    while (ap0 > dirToLight + Math.PI) { ap0 -= 2 * Math.PI; ap1 -= 2 * Math.PI; }
    // Overlap of aperture with the near arc (facing the light).
    const ov0 = Math.max(ap0, t1), ov1 = Math.min(ap1, t2);
    const apertureFacesLight = ov0 < ov1;

    // Helper: project a point away from the light to maxDist.
    function projectOut(px, py) {
        const pdx = px - lx, pdy = py - ly;
        const d = Math.hypot(pdx, pdy) || 1;
        return { x: lx + (pdx * maxDist) / d, y: ly + (pdy * maxDist) / d };
    }

    // Helper: normalize an angle difference to (-π, π].
    function normDiff(d) {
        while (d <= -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        return d;
    }

    // Helper: append the tangent-ray sides and far arc for the disc shadow.
    // The polygon must already end at the second tangent point (t2).
    function appendFarCone(t1, t2) {
        const tp1 = { x: cx + rOut * Math.cos(t1), y: cy + rOut * Math.sin(t1) };
        const tp2 = { x: cx + rOut * Math.cos(t2), y: cy + rOut * Math.sin(t2) };
        const fp2 = projectOut(tp2.x, tp2.y);
        poly.push(fp2);
        const fp1 = projectOut(tp1.x, tp1.y);
        const f1 = Math.atan2(fp2.y - ly, fp2.x - lx);
        const f2 = Math.atan2(fp1.y - ly, fp1.x - lx);
        const diff = normDiff(f2 - f1);
        for (let i = 0; i <= ARC_STEPS; i++) {
            const a = f1 + diff * (i / ARC_STEPS);
            poly.push({ x: lx + maxDist * Math.cos(a), y: ly + maxDist * Math.sin(a) });
        }
        poly.push(fp1);
    }

    // Helper: far intersection of ray (from lx,ly through px,py) with the
    // inner circle. Returns null if the ray misses.
    function rayInnerFar(px, py) {
        const rdx = px - lx, rdy = py - ly;
        const d = Math.hypot(rdx, rdy) || 1;
        const Dx = rdx / d, Dy = rdy / d;
        const Wx = lx - cx, Wy = ly - cy;
        const b = Wx * Dx + Wy * Dy;
        const c = Wx * Wx + Wy * Wy - rIn * rIn;
        const disc = b * b - c;
        if (disc < 0) return null;
        const t = -b + Math.sqrt(disc); // far intersection
        if (t <= 0) return null;
        return { x: lx + Dx * t, y: ly + Dy * t };
    }

    if (apertureFacesLight) {
        // Notched shadow: the near boundary follows the outer arc, dips in
        // through the aperture along the light rays, crosses the interior at
        // the far inner edge, and comes back out. The notch (light shaft)
        // stays unshadowed.
        const c0 = ov0, c1 = ov1;
        const PA = { x: cx + rOut * Math.cos(c0), y: cy + rOut * Math.sin(c0) };
        const PB = { x: cx + rOut * Math.cos(c1), y: cy + rOut * Math.sin(c1) };
        const PAfar = rayInnerFar(PA.x, PA.y);
        const PBfar = rayInnerFar(PB.x, PB.y);
        if (PAfar && PBfar) {
            // Outer arc from t1 to c0.
            for (let i = 0; i <= ARC_STEPS; i++) {
                const a = t1 + (c0 - t1) * (i / ARC_STEPS);
                poly.push({ x: cx + rOut * Math.cos(a), y: cy + rOut * Math.sin(a) });
            }
            // In through the aperture along the ray to the far inner edge.
            poly.push(PAfar);
            // Across the far inner edge (short way).
            const fa0 = Math.atan2(PAfar.y - cy, PAfar.x - cx);
            const fa1 = Math.atan2(PBfar.y - cy, PBfar.x - cx);
            const fdiff = normDiff(fa1 - fa0);
            for (let i = 1; i <= ARC_STEPS; i++) {
                const a = fa0 + fdiff * (i / ARC_STEPS);
                poly.push({ x: cx + rIn * Math.cos(a), y: cy + rIn * Math.sin(a) });
            }
            // Back out through the aperture.
            poly.push(PB);
            // Outer arc from c1 to t2.
            for (let i = 1; i <= ARC_STEPS; i++) {
                const a = c1 + (t2 - c1) * (i / ARC_STEPS);
                poly.push({ x: cx + rOut * Math.cos(a), y: cy + rOut * Math.sin(a) });
            }
            // Tangent rays and far arc.
            appendFarCone(t1, t2);
            return {
                poly,
                nearDist: Math.max(0, dist - rOut),
                farDist: dist + rOut,
            };
        }
        // If the ray math fails (grazing angle), fall through to plain disc.
    }

    // Plain disc shadow: tangent-ray shadow of the outer circle.
    // Near arc at rOut from t1 to t2 (facing the light).
    for (let i = 0; i <= ARC_STEPS; i++) {
        const a = t1 + (t2 - t1) * (i / ARC_STEPS);
        poly.push({ x: cx + rOut * Math.cos(a), y: cy + rOut * Math.sin(a) });
    }
    appendFarCone(t1, t2);

    return {
        poly,
        nearDist: Math.max(0, dist - rOut),
        farDist: dist + rOut,
    };
}
