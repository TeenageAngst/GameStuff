import { TEXTS } from './texts.js';

// Object factory functions.
//
// Naming convention: <room>.<type>.<name>
//   - `id` is the full compound ID (e.g. "main.narrative.air")
//   - The room is derived from the first segment of `id`
//   - Each object gets two tags: the `id` and `room:<roomId>`
//
// To add a new object type:
//   1. Create a factory function following the pattern below
//   2. Add the text key to TEXTS in src/texts.js (if applicable)
//   3. Call the factory from a room's build function in src/rooms.js

// Creates a narrative object that displays a text message when interacted with.
// The message is looked up from the TEXTS registry by `id`.
export function createNarrative(k, id, pos, ui) {
    const message = TEXTS[id];
    if (message === undefined) {
        console.warn(`[createNarrative] No text found for ID "${id}" in TEXTS registry`);
    }
    const room = id.split('.')[0];
    return k.add([
        k.rect(32, 32),
        k.pos(pos),
        k.color(0, 255, 0),
        k.area(),
        k.body({ isStatic: true }),
        "interactable",
        id,
        `room:${room}`,
        {
            interact: () => {
                ui.show(message);
            }
        }
    ]);
}

// Creates a light-source object. When toggled on (via interact), it
// illuminates the scene within the lighting system's radius; when off, the
// scene returns to darkness. The lighting system handles the actual glow.
//
// `color` is an optional [r, g, b] array that tints the light's glow and
// core (e.g. [80, 255, 120] for green). When omitted, the lighting system
// falls back to warm white. The lamp sprite is also tinted to match.
export function createLight(k, id, pos, lighting, color) {
    const room = id.split('.')[0];
    const components = [
        k.sprite("lamp.png"),
        k.scale(2),
        k.pos(pos),
        k.area(),
        k.body({ isStatic: true }),
        "interactable",
        id,
        `room:${room}`,
        {
            lightOn: false,
            lightColor: color,
            // When a wall switch (or another fixture) owns this lamp, direct
            // interaction is disabled and only the switch can flip it.
            directToggle: true,
            interact: () => {
                if (light.directToggle) light.lightOn = !light.lightOn;
            },
        }
    ];
    // Tint the lamp sprite to match the light's color so the source reads
    // as the right hue even before the glow is visible.
    if (color) {
        components.push(k.color(color[0], color[1], color[2]));
    }
    const light = k.add(components);

    if (lighting) {
        lighting.register(light);
    }

    return light;
}

// Creates a wall-mounted light switch for a lamp: a small plate with a
// toggle nub. Pressing E while touching it flips the target lamp's
// `lightOn`, and the nub visibly flips up (on) / down (off) to match.
// `lamp` is the light object returned by createLight; its own directToggle
// is usually disabled so the switch is the only way to flip it.
export function createLightSwitch(k, id, pos, lamp) {
    const room = id.split('.')[0];
    const plate = k.add([
        k.rect(16, 24),
        k.pos(pos),
        k.anchor("center"),
        k.color(225, 220, 205),
        k.area(),
        "interactable",
        id,
        `room:${room}`,
        {
            interact: () => {
                lamp.lightOn = !lamp.lightOn;
                nub.pos.y = pos[1] + (lamp.lightOn ? -5 : 5);
            },
        },
    ]);
    // Toggle nub: rides on the plate, up when the lamp is on.
    const nub = k.add([
        k.rect(6, 10),
        k.pos(pos[0], pos[1] + 5), // lamp starts off, so the nub starts down
        k.anchor("center"),
        k.color(90, 85, 75),
        `room:${room}`,
    ]);
    return [plate, nub];
}

// Creates a light director: a small ring housing around a lamp, with a
// single aperture the light shines through. The player pushes the housing
// itself to spin it, sweeping the beam around the room.
//
// The housing is a C-shaped annular sector (a ring with a gap). It is baked
// into a sprite texture (a 2D canvas path fills the concave shape correctly)
// and rendered as one sprite entity, rotated as a whole. Its shadow is
// computed by `computeAnnularSectorShadow` (shadowGeometry.js), which
// produces the exact angular wedge of the solid part of the ring — so no
// light leaks between pieces (the old 7-chord approach left ~2° gaps at
// each joint). The entity carries the "interactable" tag so rooms.js
// auto-registers it as a shadow caster; the `annularSector` property tells
// the lighting system to use the sector geometry instead of a box.
//
// `lamp` is the light object returned by createLight. The housing is
// centered on the lamp's rendered center (mirroring lightCenter in
// lighting.js), not on its top-left pos.
export function createLightDirector(k, id, lamp, lighting, player) {
    const room = id.split('.')[0];
    const R_IN = 26;         // inner radius of the ring
    const R_OUT = 34;        // outer radius of the ring
    const APERTURE = 40 * Math.PI / 180; // angular size of the opening
    const ROT_SPEED = 2.5;   // radians per second while pushed
    const RING_COLOR = [40, 40, 60];
    // Handle: a thin straight grey bar that sticks out of the back of the ring
    // (opposite the aperture). The player pushes the handle to spin the ring;
    // pushing the ring body itself does nothing.
    const HANDLE_LEN = 30;
    const HANDLE_WIDE = 4;
    const HANDLE_COLOR = [128, 128, 128];
    // Local x of the handle's center (aperture faces +x, so the back is -x).
    const HANDLE_CENTER_X = -(R_OUT + HANDLE_LEN / 2);

    // Rendered center of the lamp.
    const sx = lamp.scale ? lamp.scale.x : 1;
    const sy = lamp.scale ? lamp.scale.y : 1;
    const cx = lamp.pos.x + ((lamp.width || 32) * sx) / 2;
    const cy = lamp.pos.y + ((lamp.height || 32) * sy) / 2;

    // Current rotation in radians (0 = aperture faces east).
    let angle = 0;

    // Solid arc bounds (local, aperture centered on the +x axis). These drive
    // the shadow geometry; the rendered sprite is baked to match them.
    const a0 = APERTURE / 2;
    const a1 = Math.PI * 2 - APERTURE / 2;

    // Bake the C-shaped annular sector into a sprite texture.
    //
    // Why a baked sprite instead of k.polygon: Kaboom's drawPolygon
    // triangulates with a triangle fan from vertex 0, which is only valid for
    // convex polygons. The housing is a concave annular sector, so the fan
    // sweeps triangles across the inner hole and fills it in — the ring
    // rendered as a solid dark disc and the lamp's glow sat inside the disc
    // instead of inside the ring's opening. A 2D canvas path fills concave
    // shapes correctly, so we bake the C-shape once and render it as a sprite.
    //
    // The sprite is drawn in canvas coordinates (y-down, angles clockwise from
    // +x) with the aperture centered on the +x axis, matching the shadow
    // geometry's local frame (computeAnnularSectorShadow uses the same
    // cos/sin convention in the y-down overlay canvas). Rotating the sprite by
    // `angle` keeps the rendered aperture aligned with the shadow wedge.
    const PAD = 2;
    const SIZE = Math.ceil((R_OUT + PAD) * 2);
    const ringCanvas = document.createElement("canvas");
    ringCanvas.width = SIZE;
    ringCanvas.height = SIZE;
    const rctx = ringCanvas.getContext("2d");
    const c = SIZE / 2;
    rctx.beginPath();
    // Outer arc: a0 → a1 clockwise (the long way, through the left side).
    rctx.arc(c, c, R_OUT, a0, a1, false);
    // Line to inner radius.
    rctx.lineTo(c + R_IN * Math.cos(a1), c + R_IN * Math.sin(a1));
    // Inner arc: a1 → a0 counterclockwise (back along the inner radius).
    rctx.arc(c, c, R_IN, a1, a0, true);
    // Line back to outer radius.
    rctx.lineTo(c + R_OUT * Math.cos(a0), c + R_OUT * Math.sin(a0));
    rctx.closePath();
    rctx.fillStyle = `rgb(${RING_COLOR[0]}, ${RING_COLOR[1]}, ${RING_COLOR[2]})`;
    rctx.fill();
    // loadSprite with an ImageSource (canvas) resolves synchronously, so the
    // returned Asset is ready to use immediately.
    const ringSprite = k.loadSprite("director-ring", ringCanvas);

    const housing = k.add([
        k.sprite(ringSprite),
        k.pos(cx, cy),
        k.anchor("center"),
        k.rotate(0),
        k.area(),
        // Solid: the player cannot walk through the housing.
        k.body({ isStatic: true }),
        "interactable",
        id,
        `room:${room}`,
        { interact: () => {} },
    ]);

    // Handle: a thin straight grey bar sticking out of the back of the ring
    // (opposite the aperture). It is a separate solid entity that rotates with
    // the housing. The player pushes the handle to spin the ring; pushing the
    // ring body itself does nothing.
    const handle = k.add([
        k.rect(HANDLE_LEN, HANDLE_WIDE),
        k.pos(cx + HANDLE_CENTER_X, cy),
        k.anchor("center"),
        k.rotate(0),
        k.color(HANDLE_COLOR[0], HANDLE_COLOR[1], HANDLE_COLOR[2]),
        k.area(),
        k.body({ isStatic: true }),
        `room:${room}`,
    ]);

    // Tell the lighting system this caster is an annular sector, not a box.
    // The sector's center is the lamp center; a0/a1 are the solid arc's
    // bounds in world space (updated as the housing rotates).
    housing.annularSector = { cx, cy, rIn: R_IN, rOut: R_OUT, a0, a1 };

    // Rotate the housing and its handle, and keep the annularSector's
    // world-space angles in sync so the shadow geometry stays correct.
    function place() {
        const deg = (angle * 180) / Math.PI;
        housing.angle = deg;
        // The handle's center orbits the ring center at radius |HANDLE_CENTER_X|
        // and points radially outward (same orientation as the housing).
        handle.pos.x = cx + HANDLE_CENTER_X * Math.cos(angle);
        handle.pos.y = cy + HANDLE_CENTER_X * Math.sin(angle);
        handle.angle = deg;
        housing.annularSector.a0 = a0 + angle;
        housing.annularSector.a1 = a1 + angle;
    }
    place();

    const update = k.onUpdate(() => {
        if (housing.destroyed) {
            update.cancel(); // housing is gone; stop tracking it
            return;
        }
        // Pushing: the ring only spins while the player is pushing the handle.
        // Pushing the ring body itself does nothing.
        if (player && !player.destroyed && player.isColliding(handle)) {
            const playerAngle = Math.atan2(player.pos.y - cy, player.pos.x - cx);
            let diff = playerAngle - angle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const step = ROT_SPEED * k.dt();
            angle = Math.abs(diff) < step ? playerAngle : angle + Math.sign(diff) * step;
            place();
        }
    });

    return [housing, handle];
}

// Creates a patrolling shadow-wisp enemy. It drifts along a sinusoidal
// path; touching it knocks the player back and grants brief invulnerability.
// Enemies are NOT "interactable": they can't be E-prompted, and they don't
// block light (they're made of shadow).
//
// `opts`: x, y (patrol center), xRange (horizontal half-extent),
// yAmp (vertical bob amplitude), speed (rad/s), phase, scale.
export function createEnemy(k, id, player, opts = {}) {
    const {
        x = 400,
        y = 150,
        xRange = 150,
        yAmp = 50,
        speed = 0.7,
        phase = 0,
        scale = 0.4,
    } = opts;
    const room = id.split('.')[0];
    const enemy = k.add([
        k.sprite("wisp.png"),
        k.scale(scale),
        k.pos(x, y),
        k.anchor("center"),
        k.area(),
        k.z(2),
        "enemy",
        id,
        `room:${room}`,
    ]);

    let t = phase;
    const update = k.onUpdate(() => {
        if (enemy.destroyed) {
            update.cancel();
            return;
        }
        t += k.dt() * speed;
        enemy.pos.x = x + Math.sin(t) * xRange;
        enemy.pos.y = y + Math.sin(t * 1.6 + phase) * yAmp;
        // Knockback on touch, with an invulnerability window so one
        // touch doesn't chain-stun the player.
        if (player && !player.destroyed && enemy.isColliding(player)) {
            const now = k.time();
            if (now >= (player.nextVulnAt || 0)) {
                let dx = player.pos.x - enemy.pos.x;
                let dy = player.pos.y - enemy.pos.y;
                // Degenerate case: dead-center overlap gives no direction;
                // fall back to shoving along the enemy's patrol direction.
                if (Math.hypot(dx, dy) < 1) {
                    dx = Math.cos(t) >= 0 ? 1 : -1;
                    dy = -0.3;
                }
                const len = Math.hypot(dx, dy);
                const POWER = 380;
                player.knockVX = (dx / len) * POWER;
                player.knockVY = (dy / len) * POWER;
                player.nextVulnAt = now + 1.2;
            }
        }
    });

    return enemy;
}

// Creates a stat-modifier object that toggles the player's speed.
export function createStat(k, id, pos, player) {
    if (!player || typeof player.speed === 'undefined') {
        console.error(`[createStat] Invalid player object provided for "${id}"`);
        return null;
    }
    const room = id.split('.')[0];
    return k.add([
        k.rect(32, 32),
        k.pos(pos),
        k.color(255, 0, 0),
        k.area(),
        k.body({ isStatic: true }),
        "interactable",
        id,
        `room:${room}`,
        {
            interact: () => {
                player.speed = player.speed === 200 ? 100 : 200;
            }
        }
    ]);
}
