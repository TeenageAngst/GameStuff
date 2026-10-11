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
            interact: () => {
                light.lightOn = !light.lightOn;
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

// Creates a light director: a C-shaped occluder centered on a light source,
// with a handle bar on the back. The player pushes the handle to rotate the
// C around the light, directing the beam (the opening) in different directions.
//
// The C is made of 3 bars (top, left, bottom) arranged in a circle around the
// light, with a 90° gap on the right side (the opening) at angle 0. The handle
// is a small bar on the back (left side at angle 0). The player pushes the
// handle to rotate the C; the opening sweeps around the light, directing the
// beam.
//
// Each bar and the handle are separate shadow casters (registered via the
// "interactable" tag, which rooms.js auto-registers). The bars use the
// `k.rotate(deg)` component for rotation (entity property: obj.angle), and
// the shadow system now supports rotated boxes (see shadowGeometry.js).
export function createLightDirector(k, id, pos, lighting, player) {
    const room = id.split('.')[0];
    const R = 70;          // radius of the C (distance from center to bar centers)
    const BAR = 20;        // thickness of each bar
    const HANDLE_LEN = 50; // length of the handle bar
    const HANDLE_THICK = 16; // thickness of the handle bar
    const ROT_SPEED = 2.5;   // radians per second when pushed

    // Current rotation angle in radians (0 = opening faces right).
    let angle = 0;

    const barColor = [40, 40, 60];

    // Three bars forming the C-shape. Each uses k.anchor("center") so pos is
    // the center and rotation happens around the center. Each uses k.angle(deg)
    // for rotation and has "interactable" so rooms.js auto-registers it as a
    // shadow caster.
    const topBar = k.add([
        k.rect(R * 2, BAR),
        k.pos(pos[0], pos[1] - R),
        k.anchor("center"),
        k.color(barColor),
        k.rotate(0),
        k.area(),
        "interactable",
        `director.top`,
        `room:${room}`,
        { interact: () => {} },
    ]);
    const leftBar = k.add([
        k.rect(BAR, R * 2),
        k.pos(pos[0] - R, pos[1]),
        k.anchor("center"),
        k.color(barColor),
        k.rotate(0),
        k.area(),
        "interactable",
        `director.left`,
        `room:${room}`,
        { interact: () => {} },
    ]);
    const bottomBar = k.add([
        k.rect(R * 2, BAR),
        k.pos(pos[0], pos[1] + R),
        k.anchor("center"),
        k.color(barColor),
        k.rotate(0),
        k.area(),
        "interactable",
        `director.bottom`,
        `room:${room}`,
        { interact: () => {} },
    ]);

    // Handle bar on the back (left side at angle 0). The player pushes this
    // to rotate the C. It has a static body so the player can collide with it.
    const handle = k.add([
        k.rect(HANDLE_LEN, HANDLE_THICK),
        k.pos(pos[0] - R - HANDLE_LEN / 2, pos[1]),
        k.anchor("center"),
        k.color([100, 100, 140]),
        k.rotate(0),
        k.area(),
        k.body({ isStatic: true }),
        "interactable",
        id,
        `room:${room}`,
        { interact: () => {} },
    ]);

    // Update bar and handle positions and rotations each frame.
    k.onUpdate(() => {
        if (topBar.destroyed) return;

        // Check if the player is pushing the handle.
        if (player && !player.destroyed && player.isColliding(handle)) {
            // Compute the angle from the center to the player.
            const dx = player.pos.x - pos[0];
            const dy = player.pos.y - pos[1];
            const playerAngle = Math.atan2(dy, dx);
            // Rotate the C toward the player's angle.
            let diff = playerAngle - angle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const step = ROT_SPEED * k.dt();
            if (Math.abs(diff) < step) {
                angle = playerAngle;
            } else {
                angle += Math.sign(diff) * step;
            }
        }

        // Convert angle to degrees for the k.angle component.
        const deg = angle * 180 / Math.PI;

        // Update bar positions (orbit around the light center) and rotations.
        // Each bar's center orbits at radius R from the light, and the bar
        // itself rotates by the same angle to maintain the C-shape.
        // With k.anchor("center"), pos is the bar's center, so no offset needed.
        const topAngle = -Math.PI / 2 + angle;
        topBar.pos.x = pos[0] + R * Math.cos(topAngle);
        topBar.pos.y = pos[1] + R * Math.sin(topAngle);
        topBar.angle = deg;

        const leftAngle = Math.PI + angle;
        leftBar.pos.x = pos[0] + R * Math.cos(leftAngle);
        leftBar.pos.y = pos[1] + R * Math.sin(leftAngle);
        leftBar.angle = deg;

        const bottomAngle = Math.PI / 2 + angle;
        bottomBar.pos.x = pos[0] + R * Math.cos(bottomAngle);
        bottomBar.pos.y = pos[1] + R * Math.sin(bottomAngle);
        bottomBar.angle = deg;

        // Update handle position (on the back, opposite the opening).
        const handleAngle = angle + Math.PI;
        handle.pos.x = pos[0] + (R + HANDLE_LEN / 2) * Math.cos(handleAngle);
        handle.pos.y = pos[1] + (R + HANDLE_LEN / 2) * Math.sin(handleAngle);
        handle.angle = deg;
    });

    return [topBar, leftBar, bottomBar, handle];
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
