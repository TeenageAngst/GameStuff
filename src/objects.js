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

// Creates a light director: a small ring housing around a lamp, with a
// single aperture the light shines through. The player pushes the housing
// itself to spin it, sweeping the beam around the room.
//
// The housing is a ring of thin wall segments (each its own shadow caster,
// registered via the "interactable" tag, which rooms.js auto-registers),
// with a 40-degree gap as the aperture. The segments use the `k.rotate(deg)`
// component for rotation (entity property: obj.angle), and the shadow system
// supports rotated boxes (see shadowGeometry.js).
//
// `lamp` is the light object returned by createLight. The housing is
// centered on the lamp's rendered center (mirroring lightCenter in
// lighting.js), not on its top-left pos.
export function createLightDirector(k, id, lamp, lighting, player) {
    const room = id.split('.')[0];
    const R = 30;            // housing radius (lamp center to wall centers)
    const WALL_T = 8;        // wall thickness
    const SEG_LEN = 24;      // wall segment length (chords overlap slightly)
    const APERTURE = 40 * Math.PI / 180; // angular size of the opening
    const NSEGS = 7;         // segments covering the rest of the ring
    const ROT_SPEED = 2.5;   // radians per second while pushed

    // Rendered center of the lamp.
    const sx = lamp.scale ? lamp.scale.x : 1;
    const sy = lamp.scale ? lamp.scale.y : 1;
    const cx = lamp.pos.x + ((lamp.width || 32) * sx) / 2;
    const cy = lamp.pos.y + ((lamp.height || 32) * sy) / 2;

    // Current rotation in radians (0 = aperture faces east).
    let angle = 0;

    const span = ((Math.PI * 2) - APERTURE) / NSEGS;
    const segments = [];
    for (let i = 0; i < NSEGS; i++) {
        const baseAngle = (APERTURE / 2) + (span * (i + 0.5));
        const seg = k.add([
            k.rect(SEG_LEN, WALL_T),
            k.pos(cx + R * Math.cos(baseAngle), cy + R * Math.sin(baseAngle)),
            k.anchor("center"),
            k.color([40, 40, 60]),
            k.rotate(0),
            k.area(),
            "interactable",
            `${id}.seg${i}`,
            `room:${room}`,
            { interact: () => {} },
        ]);
        seg.baseAngle = baseAngle;
        segments.push(seg);
    }

    // Place every segment on the ring, tangential to it.
    function place() {
        for (const s of segments) {
            const a = s.baseAngle + angle;
            s.pos.x = cx + (R * Math.cos(a));
            s.pos.y = cy + (R * Math.sin(a));
            s.angle = ((a * 180) / Math.PI) + 90;
        }
    }
    place();

    const update = k.onUpdate(() => {
        if (segments[0].destroyed) {
            update.cancel(); // housing is gone; stop tracking it
            return;
        }
        // Pushing: while the player overlaps any wall segment, spin the
        // housing toward the player's position so the aperture follows them.
        if (player && !player.destroyed && segments.some((s) => player.isColliding(s))) {
            const playerAngle = Math.atan2(player.pos.y - cy, player.pos.x - cx);
            let diff = playerAngle - angle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const step = ROT_SPEED * k.dt();
            angle = Math.abs(diff) < step ? playerAngle : angle + Math.sign(diff) * step;
            place();
        }
    });

    return segments;
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
