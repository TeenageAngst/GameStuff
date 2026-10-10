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
