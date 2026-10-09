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

export function computeShadowPolygon(lx, ly, box, maxDist = SHADOW_MAX_DIST) {
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

    // The four box corners.
    const TL = { x: left, y: top };
    const TR = { x: right, y: top };
    const BR = { x: right, y: bottom };
    const BL = { x: left, y: bottom };
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
        { a: TL, b: TR, n: { x: 0, y: -1 } }, // top
        { a: TR, b: BR, n: { x: 1, y: 0 } },  // right
        { a: BR, b: BL, n: { x: 0, y: 1 } },  // bottom
        { a: BL, b: TL, n: { x: -1, y: 0 } }, // left
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
