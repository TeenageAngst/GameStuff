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
// The housing is a single annular-sector polygon (a ring with a gap),
// rendered as one `k.polygon` entity and rotated as a whole. Its shadow is
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
    const ARC_STEPS = 24;    // polygon samples per arc (smoothness)

    // Rendered center of the lamp.
    const sx = lamp.scale ? lamp.scale.x : 1;
    const sy = lamp.scale ? lamp.scale.y : 1;
    const cx = lamp.pos.x + ((lamp.width || 32) * sx) / 2;
    const cy = lamp.pos.y + ((lamp.height || 32) * sy) / 2;

    // Current rotation in radians (0 = aperture faces east).
    let angle = 0;

    // Build the annular-sector polygon in local coordinates (centered on
    // origin). The solid part spans [APERTURE/2, 2π - APERTURE/2]; the
    // aperture is the gap centered on the +x axis.
    const a0 = APERTURE / 2;
    const a1 = Math.PI * 2 - APERTURE / 2;
    const pts = [];
    // Outer arc: a0 → a1.
    for (let i = 0; i <= ARC_STEPS; i++) {
        const a = a0 + (a1 - a0) * (i / ARC_STEPS);
        pts.push(k.vec2(R_OUT * Math.cos(a), R_OUT * Math.sin(a)));
    }
    // Inner arc: a1 → a0 (reverse direction to close the ring).
    for (let i = ARC_STEPS; i >= 0; i--) {
        const a = a0 + (a1 - a0) * (i / ARC_STEPS);
        pts.push(k.vec2(R_IN * Math.cos(a), R_IN * Math.sin(a)));
    }

    const housing = k.add([
        k.polygon(pts),
        k.pos(cx, cy),
        k.anchor("center"),
        k.color([40, 40, 60]),
        k.rotate(0),
        k.area(),
        "interactable",
        id,
        `room:${room}`,
        { interact: () => {} },
    ]);

    // Tell the lighting system this caster is an annular sector, not a box.
    // The sector's center is the lamp center; a0/a1 are the solid arc's
    // bounds in world space (updated as the housing rotates).
    housing.annularSector = { cx, cy, rIn: R_IN, rOut: R_OUT, a0, a1 };

    // Rotate the housing and keep the annularSector's world-space angles in
    // sync so the shadow geometry stays correct.
    function place() {
        housing.angle = (angle * 180) / Math.PI;
        housing.annularSector.a0 = a0 + angle;
        housing.annularSector.a1 = a1 + angle;
    }
    place();

    const update = k.onUpdate(() => {
        if (housing.destroyed) {
            update.cancel(); // housing is gone; stop tracking it
            return;
        }
        // Pushing: while the player overlaps the housing, spin it toward
        // the player's position so the aperture follows them.
        if (player && !player.destroyed && player.isColliding(housing)) {
            const playerAngle = Math.atan2(player.pos.y - cy, player.pos.x - cx);
            let diff = playerAngle - angle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const step = ROT_SPEED * k.dt();
            angle = Math.abs(diff) < step ? playerAngle : angle + Math.sign(diff) * step;
            place();
        }
    });

    return [housing];
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
