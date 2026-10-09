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

import { computeShadowPolygon, SHADOW_MAX_DIST } from "./shadowGeometry.js";

const DARKNESS = 0.65; // overlay opacity when no lights are on (default)
const LIGHT_RADIUS = 220; // radius (px) of a light's illumination
const FADE_TIME = 0.2; // seconds to fade a light in/out
const CORE_RADIUS = 20; // bright core drawn above the darkness at the source
const SHADOW_OPACITY = 0.85; // peak darkness of a shadow (just behind the object)
const SHADOW_MARGIN = 2; // px padding around a caster so its body stays in shadow
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
    // (lx, ly). Thin wrapper around the pure geometry in shadowGeometry.js
    // (unit-tested in tests/shadow.test.js). Returns { poly, nearDist,
    // farDist } or null if the caster is too far away to matter.
    function shadowPolygon(lx, ly, box) {
        return computeShadowPolygon(lx, ly, box, SHADOW_MAX_DIST);
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
