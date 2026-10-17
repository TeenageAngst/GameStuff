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

import { computeShadowPolygon, computeAnnularSectorShadow, SHADOW_MAX_DIST } from "./shadowGeometry.js";

const DARKNESS = 0.65; // overlay opacity when no lights are on (default)
const LIGHT_RADIUS = 220; // radius (px) of a light's illumination
const FADE_TIME = 0.2; // seconds to fade a light in/out
const CORE_RADIUS = 20; // bright core drawn above the darkness at the source
const SHADOW_MARGIN = 2; // px padding around a caster so its body stays in shadow
const SHADOW_FADE = 0.7; // fraction of the light radius over which the shadow fades out
const SHADOW_SOFT = 8; // px blur radius for softening the shadow's edges
const GLOW_STRENGTH = 0.6; // how strongly a light's color tints its lit area

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

    // Glow canvas sits ABOVE the darkness overlay. It is purely additive: it
    // holds each light's colored halo and is drawn with "screen"-like blending
    // (via CSS mix-blend-mode) so it tints the scene without adding darkness.
    // Keeping it separate from the darkness overlay is essential — the overlay's
    // alpha IS the darkness level, so adding color there would re-darken the
    // very area the light is meant to illuminate.
    const glow = document.createElement("canvas");
    glow.width = W;
    glow.height = H;
    glow.style.position = "fixed";
    glow.style.pointerEvents = "none";
    glow.style.zIndex = "11";
    glow.style.mixBlendMode = "screen";
    document.body.appendChild(glow);
    const gctx = glow.getContext("2d");

    // Offscreen temp canvas (same size as the overlay) used to compose each
    // light's illumination minus its shadows before carving it into the main
    // overlay. This lets shadows *block* light (subtractive) instead of adding
    // black on top of the already-erased light hole (which made shadows darker
    // than the ambient background).
    const temp = document.createElement("canvas");
    temp.width = W;
    temp.height = H;
    const tctx = temp.getContext("2d");

    // Position both canvases to exactly cover the game canvas (viewport coords).
    function positionOverlay() {
        if (!gameCanvas) return;
        const rect = gameCanvas.getBoundingClientRect();
        for (const c of [overlay, glow]) {
            c.style.left = rect.left + "px";
            c.style.top = rect.top + "px";
            c.style.width = rect.width + "px";
            c.style.height = rect.height + "px";
        }
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

    // Returns the light's color as an [r, g, b] array. Defaults to warm white
    // for lights that don't specify a color (e.g. the main room's lamp).
    function lightColor(light) {
        return light.lightColor || [255, 240, 200];
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
        // For rotated objects, use the unrotated rectangle (from pos/width/
        // height/anchor) so the shadow geometry can rotate it correctly.
        // The `area` component's pos is the AABB of the rotated shape, which
        // would be too large.
        if (obj.area && obj.area.pos && !obj.angle) {
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
            angle: (obj.angle || 0) * Math.PI / 180,
        };
    }

    // Compute the shadow polygon for a caster box relative to light center
    // (lx, ly). Thin wrapper around the pure geometry in shadowGeometry.js
    // (unit-tested in tests/shadow.test.js). Returns { poly, nearDist,
    // farDist } or null if the caster is too far away to matter.
    function shadowPolygon(lx, ly, box) {
        return computeShadowPolygon(lx, ly, box, SHADOW_MAX_DIST, box.angle || 0);
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

        // 2. Fill the overlay with darkness and clear the glow canvas. Both
        //    are reset at the start of the frame so the per-light loop below
        //    accumulates fresh content on top.
        octx.globalCompositeOperation = "source-over";
        octx.clearRect(0, 0, W, H);
        octx.fillStyle = `rgba(0, 0, 0, ${darkness})`;
        octx.fillRect(0, 0, W, H);
        gctx.globalCompositeOperation = "source-over";
        gctx.clearRect(0, 0, W, H);

        // The lighting overlay is a separate canvas. To align world coordinates
        // to this canvas, we need the world position of the canvas's top-left corner.
        // In this Kaplay build the camera position is read via k.camPos() (there is
        // no k.cam object). The top-left of the viewport is
        // (camPos.x - W/2, camPos.y - H/2).
        //
        // If the camera is clamped to the room bounds, k.camPos() still returns the
        // center of the viewport in world space, so the offset stays correct.
        const camPos = k.camPos();
        const offsetX = camPos ? camPos.x - W / 2 : 0;
        const offsetY = camPos ? camPos.y - H / 2 : 0;

        // 3. Carve a smooth radial hole for each active light, minus its
        //    shadows. For each light we compose its illumination on the temp
        //    canvas, then *erase* the shadow polygons out of it (subtractive),
        //    and finally carve the result into the main overlay.
        //
        //    Why subtractive: a shadow should only block the light and return
        //    that region to the ambient darkness level. The old approach added
        //    black on top of the already-erased light hole, which made the
        //    shadow darker than the surrounding background (and produced a hard
        //    "pop" at the light edge). Erasing the shadow from the light's
        //    illumination instead means the shadow region simply keeps the
        //    ambient darkness — it can never be darker than the background.
        for (const light of lights) {
            if (light.intensity <= 0) continue;
            const { x: lx, y: ly } = lightCenter(light);
            const slx = lx - offsetX;
            const sly = ly - offsetY;

            // 3a. Draw this light's radial illumination onto the temp canvas.
            tctx.clearRect(0, 0, W, H);
            tctx.globalCompositeOperation = "source-over";
            const grad = tctx.createRadialGradient(slx, sly, 0, slx, sly, LIGHT_RADIUS);
            grad.addColorStop(0, `rgba(0, 0, 0, ${light.intensity})`);
            grad.addColorStop(0.6, `rgba(0, 0, 0, ${light.intensity * 0.55})`);
            grad.addColorStop(1, "rgba(0, 0, 0, 0)");
            tctx.fillStyle = grad;
            tctx.beginPath();
            tctx.arc(slx, sly, LIGHT_RADIUS, 0, Math.PI * 2);
            tctx.fill();

            // 3b. Erase each shadow polygon out of the light's illumination.
            //     The shadow is a soft cone: it starts at the object's far
            //     edge (so the object itself stays lit) and fades out over
            //     SHADOW_FADE * LIGHT_RADIUS. A radial gradient centered on
            //     the light provides the fade, and a blur filter softens the
            //     edges so the shadow looks like light bending around the
            //     object rather than a hard polygon.
            tctx.globalCompositeOperation = "destination-out";
            tctx.filter = `blur(${SHADOW_SOFT}px)`;
            for (const caster of shadowCasters) {
                if (caster.destroyed) continue;
                let result;
                let isSectorWedge = false;
                if (caster.annularSector) {
                    // Annular-sector caster (e.g. the light director's ring).
                    // The ring blocks ALL light sources, not just the one
                    // inside it. computeAnnularSectorShadow dispatches on the
                    // light's position:
                    // - Light at the ring's center (dist < rIn): exact angular
                    //   wedge of the solid part [a0, a1]; no light leaks
                    //   between pieces. Hard shadow (no fade) across the full
                    //   light radius — the ring is a solid barrier.
                    // - Exterior light, aperture facing away: tangent-ray disc
                    //   shadow covering the interior plus the region behind.
                    // - Exterior light, aperture facing it: as above, with a
                    //   notch so the light shaft enters through the aperture.
                    // See computeAnnularSectorShadow for the full geometry.
                    const sec = caster.annularSector;
                    const distToCenter = Math.hypot(lx - sec.cx, ly - sec.cy);
                    result = computeAnnularSectorShadow(lx, ly, sec, SHADOW_MAX_DIST);
                    isSectorWedge = distToCenter < sec.rIn;
                } else {
                    const box = casterBox(caster, SHADOW_MARGIN);
                    result = shadowPolygon(lx, ly, box);
                }
                if (!result) continue;
                const { poly, farDist } = result;
                // Radial gradient centered on the light: fully opaque (full
                // erase) at the object's far edge, fading to transparent at
                // the edge of the light's radius. This makes the shadow
                // soften with distance.
                //
                // For the exact sector wedge (a light at the ring's center),
                // the shadow must fully block the light throughout the entire
                // light radius — the ring is a solid barrier, not a soft
                // occluder. Use LIGHT_RADIUS as the "far edge" so the gradient
                // stays at full opacity across the whole illuminated area.
                // For a box shadow (external light), use the normal gradient
                // (fading with distance).
                const effectiveFarDist = isSectorWedge ? LIGHT_RADIUS : farDist;
                const fadeEnd = effectiveFarDist + SHADOW_FADE * LIGHT_RADIUS;
                // The gradient must be centered on the light's *screen* position
                // (slx, sly), not its world position (lx, ly): the shadow polygon
                // below is drawn in screen space (poly - offset), so a world-space
                // gradient center would be shifted by (offsetX, offsetY) and fall
                // outside the polygon whenever the camera is not at the origin.
                // That is why shadows rendered in the empty room (camera clamped to
                // the origin, offset = 0) but vanished in the long hallway.
                const sgrad = tctx.createRadialGradient(slx, sly, 0, slx, sly, Math.max(fadeEnd, 1));
                const peak = light.intensity;
                sgrad.addColorStop(0, `rgba(0, 0, 0, ${peak})`);
                sgrad.addColorStop(Math.min(1, effectiveFarDist / fadeEnd), `rgba(0, 0, 0, ${peak})`);
                sgrad.addColorStop(1, "rgba(0, 0, 0, 0)");
                tctx.fillStyle = sgrad;
                tctx.beginPath();
                tctx.moveTo(poly[0].x - offsetX, poly[0].y - offsetY);
                for (let i = 1; i < poly.length; i++) {
                    tctx.lineTo(poly[i].x - offsetX, poly[i].y - offsetY);
                }
                tctx.closePath();
                tctx.fill();
            }
            tctx.filter = "none";

            // 3c. Carve the composed illumination (minus shadows) into the
            //     main overlay, erasing the ambient darkness there.
            octx.globalCompositeOperation = "destination-out";
            octx.drawImage(temp, 0, 0);

            // 3d. Tint the illuminated region with the light's color on the
            //     separate glow canvas. The temp canvas still holds the
            //     illumination-minus-shadows shape, so we scale its alpha down
            //     (destination-in), convert it to the light's color (source-in),
            //     and additively composite it onto the glow canvas. The glow
            //     canvas uses CSS mix-blend-mode: screen, so it brightens the
            //     scene with the light's hue without adding any darkness.
            const [cr, cg, cb] = lightColor(light);
            tctx.globalCompositeOperation = "destination-in";
            tctx.fillStyle = `rgba(0, 0, 0, ${GLOW_STRENGTH})`;
            tctx.fillRect(0, 0, W, H);
            tctx.globalCompositeOperation = "source-in";
            tctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
            tctx.fillRect(0, 0, W, H);
            gctx.globalCompositeOperation = "lighter";
            gctx.drawImage(temp, 0, 0);
        }

        // 5. Draw a small bright core above the darkness for each active light
        //    so the source itself stays visible. The core uses the light's own
        //    color so colored lamps glow in their hue.
        octx.globalCompositeOperation = "lighter";
        for (const light of lights) {
            if (light.intensity <= 0) continue;
            const { x, y } = lightCenter(light);
            const sx = x - offsetX;
            const sy = y - offsetY;
            const [cr, cg, cb] = lightColor(light);
            const core = octx.createRadialGradient(sx, sy, 0, sx, sy, CORE_RADIUS);
            core.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.9 * light.intensity})`);
            core.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
            octx.fillStyle = core;
            octx.beginPath();
            octx.arc(sx, sy, CORE_RADIUS, 0, Math.PI * 2);
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
        // resize listener, and remove both canvases from the DOM.
        destroy() {
            destroyed = true;
            updateController.cancel();
            window.removeEventListener("resize", positionOverlay);
            overlay.remove();
            glow.remove();
            lights.clear();
            shadowCasters.clear();
        },
    };
}
