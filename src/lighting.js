// Lighting system: a 2D canvas overlay (darkness with smooth radial holes)
// drawn on top of the WebGL game canvas.
//
// Model: the whole scene is covered by a semi-transparent black overlay
// (DARKNESS). Each active light erases a smooth radial-gradient hole in the
// overlay (canvas "destination-out" compositing), revealing the scene near
// the light and leaving the rest dim. Lights fade in/out over FADE_TIME
// seconds instead of popping.
//
// This build of Kaboom renders via WebGL, so k.onDraw does not expose a 2D
// context. Instead we use a separate <canvas> positioned exactly over the
// game canvas and redraw it every frame in k.onUpdate.

const DARKNESS = 0.65; // overlay opacity when no lights are on (default)
const LIGHT_RADIUS = 220; // radius (px) of a light's illumination
const FADE_TIME = 0.2; // seconds to fade a light in/out
const CORE_RADIUS = 20; // bright core drawn above the darkness at the source
const SHADOW_OPACITY = 0.85; // peak darkness of a shadow (just behind the object)
const SHADOW_MARGIN = 2; // px padding around a caster so its body stays in shadow
const SHADOW_MAX_DIST = 1200; // max distance a caster can be from a light to cast
const SHADOW_FADE = 0.7; // fraction of the light radius over which the shadow fades out
const SHADOW_SOFT = 8; // px blur radius for softening the shadow's edges

export function createLighting(k) {
    const W = k.width();
    const H = k.height();

    // The game canvas (created by kaplay()). Fall back to the first canvas in
    // the DOM if k.canvas() is not available in this build.
    const gameCanvas =
        (typeof k.canvas === "function" && k.canvas()) ||
        document.querySelector("canvas");

    // Overlay canvas sits exactly on top of the game canvas. Its backing store
    // matches the logical game size (W x H), so game coordinates map 1:1.
    const overlay = document.createElement("canvas");
    overlay.width = W;
    overlay.height = H;
    overlay.style.position = "fixed";
    overlay.style.pointerEvents = "none"; // never block input
    overlay.style.zIndex = "10";
    document.body.appendChild(overlay);
    const octx = overlay.getContext("2d");

    // Position the overlay to exactly cover the game canvas (viewport coords).
    function positionOverlay() {
        if (!gameCanvas) return;
        const rect = gameCanvas.getBoundingClientRect();
        overlay.style.left = rect.left + "px";
        overlay.style.top = rect.top + "px";
        overlay.style.width = rect.width + "px";
        overlay.style.height = rect.height + "px";
    }
    positionOverlay();
    window.addEventListener("resize", positionOverlay);
    // Reposition once layout has settled after load.
    setTimeout(() => { if (!destroyed) positionOverlay(); }, 0);
    setTimeout(() => { if (!destroyed) positionOverlay(); }, 100);

    const lights = new Set();
    let destroyed = false;

    // Compute the rendered center of a light object. `pos` is the top-left
    // corner (default anchor), and the sprite is scaled by `light.scale`, so
    // the on-screen size is width*scale x height*scale. Falls back to 32 for
    // objects without a sprite (e.g. the old rect placeholder).
    function lightCenter(light) {
        const sx = light.scale ? light.scale.x : 1;
        const sy = light.scale ? light.scale.y : 1;
        const w = (light.width || 32) * sx;
        const h = (light.height || 32) * sy;
        return { x: light.pos.x + w / 2, y: light.pos.y + h / 2 };
    }

    // --- Shadow casting -------------------------------------------------
    //
    // For each light we compute a "shadow polygon" for every shadow-casting
    // object: the region behind the object (relative to the light) that the
    // light cannot reach. The polygon is built from the object's two corners
    // that face the light, each projected outward to the edge of the light's
    // radius. The polygon is then re-darkened on the overlay, so the lit
    // hole is carved out except where a shadow falls.
    //
    // Shadow casters are registered via registerShadowCaster() (the player
    // and interactable objects). They are kept in a Set so destroyed objects
    // can be removed.

    const shadowCasters = new Set();

    // Axis-aligned bounding box of an object in world coordinates, padded by
    // `margin` so the object's own body stays inside its shadow.
    //
    // Prefers the object's `area` component (a world-space rect that is
    // anchor-independent), falling back to a pos/width computation that
    // accounts for the object's anchor. This matters because the player uses
    // anchor("center") while most objects use the default top-left anchor.
    function casterBox(obj, margin) {
        let x, y, w, h;
        if (obj.area && obj.area.pos) {
            // `area` is a world-space rect: .pos is its top-left corner.
            x = obj.area.pos.x;
            y = obj.area.pos.y;
            w = obj.area.width;
            h = obj.area.height;
        } else {
            const sx = obj.scale ? obj.scale.x : 1;
            const sy = obj.scale ? obj.scale.y : 1;
            w = (obj.width || 32) * sx;
            h = (obj.height || 32) * sy;
            // Anchor offset: kaplay anchors are strings like "center",
            // "topleft", "topright", "botleft", "botright", "top", "bottom",
            // "left", "right". Map to (ax, ay) in [0,1] where 0 = left/top
            // and 1 = right/bottom.
            const anchor = typeof obj.anchor === "string" ? obj.anchor : "topleft";
            const ax = /right/.test(anchor) ? 1 : /left/.test(anchor) ? 0 : 0.5;
            const ay = /bot/.test(anchor) ? 1 : /top/.test(anchor) ? 0 : 0.5;
            x = obj.pos.x - ax * w;
            y = obj.pos.y - ay * h;
        }
        return {
            x: x - margin,
            y: y - margin,
            w: w + margin * 2,
            h: h + margin * 2,
        };
    }

    // Compute the shadow polygon for a caster box relative to light center
    // (lx, ly). Returns an object { poly, nearDist, farDist } where `poly` is
    // an array of {x, y} points forming a convex polygon, `nearDist` is the
    // distance from the light to the box's near edge, and `farDist` is the
    // distance to the box's far edge. Returns null if the caster is too far
    // away to matter.
    //
    // The shadow is the region BEHIND the caster (away from the light) that
    // the light cannot reach. It starts at the box's far edge (so the object
    // itself stays lit) and diverges outward, bounded by the two silhouette
    // rays (the light's tangent rays to the box). The resulting trapezoid
    // covers exactly the region behind the caster.
    function shadowPolygon(lx, ly, box) {
        const left = box.x;
        const right = box.x + box.w;
        const top = box.y;
        const bottom = box.y + box.h;
        const bcx = (left + right) / 2;
        const bcy = (top + bottom) / 2;
        const dx = bcx - lx;
        const dy = bcy - ly;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001 || dist > SHADOW_MAX_DIST) return null;
        const D = { x: dx / dist, y: dy / dist }; // unit vector light -> box center

        // The two silhouette corners are the box corners the light's tangent
        // rays graze. We find them by computing each corner's angle relative
        // to the light-to-box-center direction and taking the min and max.
        const baseAngle = Math.atan2(bcy - ly, bcx - lx);
        const corners = [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom },
        ];
        let minRel = Infinity;
        let maxRel = -Infinity;
        let c1 = corners[0];
        let c2 = corners[0];
        for (const c of corners) {
            const abs = Math.atan2(c.y - ly, c.x - lx);
            let rel = abs - baseAngle;
            while (rel > Math.PI) rel -= 2 * Math.PI;
            while (rel < -Math.PI) rel += 2 * Math.PI;
            if (rel < minRel) { minRel = rel; c1 = c; }
            if (rel > maxRel) { maxRel = rel; c2 = c; }
        }

        // The far edge is the box edge whose outward normal is most aligned
        // with D (the light-to-box-center direction). Its two endpoints are
        // the near boundary of the shadow (the shadow starts here, so the
        // object stays lit).
        const edges = [
            { n: { x: 1, y: 0 }, a: { x: right, y: top }, b: { x: right, y: bottom } },
            { n: { x: -1, y: 0 }, a: { x: left, y: top }, b: { x: left, y: bottom } },
            { n: { x: 0, y: 1 }, a: { x: left, y: bottom }, b: { x: right, y: bottom } },
            { n: { x: 0, y: -1 }, a: { x: left, y: top }, b: { x: right, y: top } },
        ];
        let best = edges[0];
        let bestDot = -Infinity;
        for (const e of edges) {
            const dot = e.n.x * D.x + e.n.y * D.y;
            if (dot > bestDot) { bestDot = dot; best = e; }
        }
        let f1 = best.a;
        let f2 = best.b;
        // For a diagonal light, the far boundary is the single corner where
        // the two most-aligned edges meet. Use that corner (degenerate
        // trapezoid -> triangle) so the shadow starts at the far corner.
        if (bestDot < 0.99) {
            let far = corners[0];
            let farProj = -Infinity;
            for (const c of corners) {
                const proj = (c.x - bcx) * D.x + (c.y - bcy) * D.y;
                if (proj > farProj) { farProj = proj; far = c; }
            }
            f1 = far;
            f2 = far;
        }

        // Project the far-edge endpoints outward from the light to the shadow
        // boundary (SHADOW_MAX_DIST). The shadow polygon is the quadrilateral
        // f1 -> p1 -> p2 -> f2.
        function project(corner) {
            const vx = corner.x - lx;
            const vy = corner.y - ly;
            const len = Math.sqrt(vx * vx + vy * vy);
            if (len < 0.001) return { x: corner.x, y: corner.y };
            const t = SHADOW_MAX_DIST / len;
            return { x: lx + vx * t, y: ly + vy * t };
        }
        const p1 = project(f1);
        const p2 = project(f2);

        // Near/far distances from the light to the box (for the gradient).
        const nearDist = dist - Math.max(box.w, box.h) / 2;
        const farDist = dist + Math.max(box.w, box.h) / 2;

        return { poly: [f1, p1, p2, f2], nearDist: Math.max(0, nearDist), farDist };
    }
    // Current darkness level (0 = fully lit, 1 = fully dark). Defaults to the
    // DARKNESS constant; rooms can override it via setDarkness().
    let darkness = DARKNESS;

    const updateController = k.onUpdate(() => {
        if (destroyed) return;

        // 1. Fade each light's intensity toward its target (on = 1, off = 0).
        const step = k.dt() / FADE_TIME;
        for (const light of lights) {
            const target = light.lightOn ? 1 : 0;
            if (light.intensity === target) continue;
            light.intensity =
                light.intensity < target
                    ? Math.min(target, light.intensity + step)
                    : Math.max(target, light.intensity - step);
        }

        // 2. Fill the overlay with darkness.
        octx.globalCompositeOperation = "source-over";
        octx.clearRect(0, 0, W, H);
        octx.fillStyle = `rgba(0, 0, 0, ${darkness})`;
        octx.fillRect(0, 0, W, H);

        // 3. Erase a smooth radial hole for each active light. The gradient
        //    goes from fully opaque (full erase) at the center to fully
        //    transparent (no erase) at the edge, giving a soft falloff.
        octx.globalCompositeOperation = "destination-out";
        for (const light of lights) {
            if (light.intensity <= 0) continue;
            const { x, y } = lightCenter(light);
            const grad = octx.createRadialGradient(x, y, 0, x, y, LIGHT_RADIUS);
            grad.addColorStop(0, `rgba(0, 0, 0, ${light.intensity})`);
            grad.addColorStop(0.6, `rgba(0, 0, 0, ${light.intensity * 0.55})`);
            grad.addColorStop(1, "rgba(0, 0, 0, 0)");
            octx.fillStyle = grad;
            octx.beginPath();
            octx.arc(x, y, LIGHT_RADIUS, 0, Math.PI * 2);
            octx.fill();
        }

        // 4. Re-darken shadow cones. For each active light, compute the
        //    shadow of every shadow-casting object and fill the shadow region
        //    with darkness. This carves the shadow out of the light's hole.
        //    Each light's shadows are clipped to its radius so they never
        //    extend beyond the lit area.
        //
        //    The shadow is a soft cone: it starts at the object's far edge
        //    (so the object itself stays lit) and fades out over
        //    SHADOW_FADE * LIGHT_RADIUS. A radial gradient centered on the
        //    light provides the fade, and a blur filter softens the edges so
        //    the shadow looks like light bending around the object rather
        //    than a hard polygon.
        octx.globalCompositeOperation = "source-over";
        for (const light of lights) {
            if (light.intensity <= 0) continue;
            const { x: lx, y: ly } = lightCenter(light);
            octx.save();
            octx.beginPath();
            octx.arc(lx, ly, LIGHT_RADIUS, 0, Math.PI * 2);
            octx.clip();
            octx.filter = `blur(${SHADOW_SOFT}px)`;
            for (const caster of shadowCasters) {
                if (caster.destroyed) continue;
                const box = casterBox(caster, SHADOW_MARGIN);
                const result = shadowPolygon(lx, ly, box);
                if (!result) continue;
                const { poly, farDist } = result;
                // Radial gradient centered on the light: fully dark at the
                // object's far edge, fading to transparent at the edge of the
                // light's radius. This makes the shadow soften with distance.
                const fadeEnd = farDist + SHADOW_FADE * LIGHT_RADIUS;
                const grad = octx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(fadeEnd, 1));
                const peak = SHADOW_OPACITY * light.intensity;
                grad.addColorStop(0, `rgba(0, 0, 0, ${peak})`);
                grad.addColorStop(Math.min(1, farDist / fadeEnd), `rgba(0, 0, 0, ${peak})`);
                grad.addColorStop(1, "rgba(0, 0, 0, 0)");
                octx.fillStyle = grad;
                octx.beginPath();
                octx.moveTo(poly[0].x, poly[0].y);
                for (let i = 1; i < poly.length; i++) {
                    octx.lineTo(poly[i].x, poly[i].y);
                }
                octx.closePath();
                octx.fill();
            }
            octx.filter = "none";
            octx.restore();
        }

        // 5. Draw a small bright core above the darkness for each active light
        //    so the source itself stays visible.
        octx.globalCompositeOperation = "lighter";
        for (const light of lights) {
            if (light.intensity <= 0) continue;
            const { x, y } = lightCenter(light);
            const core = octx.createRadialGradient(x, y, 0, x, y, CORE_RADIUS);
            core.addColorStop(0, `rgba(255, 240, 200, ${0.9 * light.intensity})`);
            core.addColorStop(1, "rgba(255, 240, 200, 0)");
            octx.fillStyle = core;
            octx.beginPath();
            octx.arc(x, y, CORE_RADIUS, 0, Math.PI * 2);
            octx.fill();
        }
        octx.globalCompositeOperation = "source-over";
    });

    return {
        // Register a game object as a light source. The object must have a
        // boolean `lightOn` property; `intensity` is managed by this system.
        register(light) {
            light.intensity = 0;
            lights.add(light);
        },
        unregister(light) {
            lights.delete(light);
        },
        // Register a game object as a shadow caster. The object's bounding
        // box is used to compute its shadow for each active light.
        registerShadowCaster(obj) {
            shadowCasters.add(obj);
        },
        unregisterShadowCaster(obj) {
            shadowCasters.delete(obj);
        },
        // Set the base darkness level for the current room (0 = fully lit,
        // 1 = fully dark). Called by the room manager on each room change.
        setDarkness(level) {
            darkness = Math.max(0, Math.min(1, level));
        },
        // Tear down the lighting system: stop the update loop, remove the
        // resize listener, and remove the overlay canvas from the DOM.
        destroy() {
            destroyed = true;
            updateController.cancel();
            window.removeEventListener("resize", positionOverlay);
            overlay.remove();
            lights.clear();
            shadowCasters.clear();
        },
    };
}
