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
    if (dist < 0.001 || dist > maxDist) return null;
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
    function project(pt) {
        const vx = pt.x - lx;
        const vy = pt.y - ly;
        const len = Math.sqrt(vx * vx + vy * vy);
        if (len < 0.001) return { x: pt.x, y: pt.y };
        const t = maxDist / len;
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
// The shadow is the region behind the sector (away from the light) that the
// light cannot reach. For a light at the sector's center (the common case for
// a light director), the shadow is the angular wedge [a0, a1] extending from
// rOut to maxDist. The polygon is a proper annular sector:
//   - Near boundary: arc at rOut from a0 to a1 (counterclockwise).
//   - Far boundary: arc at maxDist from a1 back to a0 (clockwise).
// Both arcs are sampled at ARC_STEPS points for smoothness. The two radial
// edges (at a0 and a1) are implicit in the polygon's lineTo connections.
//
// For a light elsewhere (not at the center), the shadow is more complex: the
// ring is a physical object with a hole, so light can only enter the interior
// through the aperture. The shadow polygon is the region that's blocked by the
// ring, including the interior that's not visible from the light through the
// aperture. This is computed by finding the tangent rays from the light to the
// outer circle and determining which parts of the ring are visible.
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

    // Light is elsewhere: compute the shadow of the outer circle.
    // This blocks all light behind the ring, including the interior.
    
    const tangentAngle = Math.acos(rOut / dist);
    const baseAngle = Math.atan2(cy - ly, cx - lx);
    const tanAngle1 = baseAngle - tangentAngle;
    const tanAngle2 = baseAngle + tangentAngle;
    
    const tanPt1 = { x: cx + rOut * Math.cos(tanAngle1), y: cy + rOut * Math.sin(tanAngle1) };
    const tanPt2 = { x: cx + rOut * Math.cos(tanAngle2), y: cy + rOut * Math.sin(tanAngle2) };
    
    // Near boundary: arc of outer circle facing the light.
    // The near arc is the one that contains the angle from the center to the light.
    // Angle from center to light is baseAngle + PI.
    const lightAngle = (baseAngle + Math.PI) % (2 * Math.PI);
    const nTan1 = (tanAngle1 % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const nTan2 = (tanAngle2 % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    
    let start, end;
    if (nTan1 < nTan2) {
        if (lightAngle >= nTan1 && lightAngle <= nTan2) {
            start = nTan1; end = nTan2;
        } else {
            start = nTan2; end = nTan1 + 2 * Math.PI;
        }
    } else {
        if (lightAngle >= nTan2 && lightAngle <= nTan1) {
            start = nTan2; end = nTan1;
        } else {
            start = nTan1; end = nTan2 + 2 * Math.PI;
        }
    }
    
    for (let i = 0; i <= ARC_STEPS; i++) {
        const a = start + (end - start) * (i / ARC_STEPS);
        poly.push({ x: cx + rOut * Math.cos(a), y: cy + rOut * Math.sin(a) });
    }
    
    // Project tangent points to maxDist.
    const p1 = { x: lx + (tanPt1.x - lx) * (maxDist / Math.hypot(tanPt1.x - lx, tanPt1.y - ly)),
                  y: ly + (tanPt1.y - ly) * (maxDist / Math.hypot(tanPt1.x - lx, tanPt1.y - ly)) };
    const p2 = { x: lx + (tanPt2.x - lx) * (maxDist / Math.hypot(tanPt2.x - lx, tanPt2.y - ly)),
                  y: ly + (tanPt2.y - ly) * (maxDist / Math.hypot(tanPt2.x - lx, tanPt2.y - ly)) };
    
    poly.push(p2);
    
    // Far boundary: arc at maxDist.
    const fStart = Math.atan2(p2.y - ly, p2.x - lx);
    const fEnd = Math.atan2(p1.y - ly, p1.x - lx);
    
    let diff = fEnd - fStart;
    while (diff < 0) diff += 2 * Math.PI;
    while (diff > 2 * Math.PI) diff -= 2 * Math.PI;
    
    for (let i = 0; i <= ARC_STEPS; i++) {
        const a = fStart + diff * (i / ARC_STEPS);
        poly.push({ x: lx + maxDist * Math.cos(a), y: ly + maxDist * Math.sin(a) });
    }
    
    poly.push(p1);

    return {
        poly,
        nearDist: Math.max(0, dist - rOut),
        farDist: dist + rOut,
    };
}
