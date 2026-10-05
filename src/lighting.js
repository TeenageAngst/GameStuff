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

export function createLighting(k) {
    const W = k.width();
    const H = k.height();

    // The game canvas (created by kaboom()). Fall back to the first canvas in
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
            const x = light.pos.x + (light.width || 32) / 2;
            const y = light.pos.y + (light.height || 32) / 2;
            const grad = octx.createRadialGradient(x, y, 0, x, y, LIGHT_RADIUS);
            grad.addColorStop(0, `rgba(0, 0, 0, ${light.intensity})`);
            grad.addColorStop(0.6, `rgba(0, 0, 0, ${light.intensity * 0.55})`);
            grad.addColorStop(1, "rgba(0, 0, 0, 0)");
            octx.fillStyle = grad;
            octx.beginPath();
            octx.arc(x, y, LIGHT_RADIUS, 0, Math.PI * 2);
            octx.fill();
        }

        // 4. Draw a small bright core above the darkness for each active light
        //    so the source itself stays visible.
        octx.globalCompositeOperation = "lighter";
        for (const light of lights) {
            if (light.intensity <= 0) continue;
            const x = light.pos.x + (light.width || 32) / 2;
            const y = light.pos.y + (light.height || 32) / 2;
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
        },
    };
}
