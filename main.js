import { createPlayer } from './src/player.js';
import { setupInteraction } from './src/interaction.js';
import { createUI } from './src/ui.js';
import { createNarrative, createLight, createStat, createLightDirector, createLightSwitch } from './src/objects.js';
import { createBackground } from './src/background.js';
import { createLighting } from './src/lighting.js';
import { createRooms, ROOM_IDS } from './src/rooms.js';
import { TEXTS } from './src/texts.js';

const k = kaplay({
    background: [0, 0, 0],
    width: 800,
    height: 600,
    gravity: 0,
});

window.k = k;

// Draws a 32x32 directional player sprite on an offscreen canvas and
// returns it as a data URL for k.loadSprite. This keeps the original
// side-on humanoid — head, torso, arms, legs, pixel-for-pixel from
// player.png — and shows direction the classic way: down = front view
// (two eyes), up = back of head (no eyes, darker), left/right = head
// turned toward that side (eyes shifted). The earlier rounded blob with
// eyes on one edge read as a top-down token; this stays a standing person.
function makePlayerSprite(facing) {
    const S = 32;
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const ctx = cv.getContext("2d");
    const TAN = "#e5c49d", EDGE = "#aa8f6f", EYE = "#a17d52", BACK = "#bea582";
    const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    // Head outline: top rows 4-5, sides rows 6-13.
    r(10, 4, 12, 2, EDGE);
    r(8, 6, 2, 8, EDGE); r(22, 6, 2, 8, EDGE);
    r(10, 6, 12, 8, facing === "up" ? BACK : TAN);
    // Eyes by facing (up: back of head, none).
    if (facing === "down") {
        r(12, 10, 2, 2, EYE); r(18, 10, 2, 2, EYE);
    } else if (facing === "left") {
        r(10, 10, 2, 2, EYE); r(15, 10, 2, 2, EYE);
    } else if (facing === "right") {
        r(15, 10, 2, 2, EYE); r(20, 10, 2, 2, EYE);
    }
    // Body (identical for all facings): shoulders, torso, arms, legs.
    r(2, 14, 6, 2, EDGE); r(24, 14, 6, 2, EDGE); r(8, 14, 16, 2, TAN);
    r(0, 16, 2, 6, EDGE); r(30, 16, 2, 6, EDGE); r(2, 16, 28, 6, TAN);
    r(0, 22, 2, 6, EDGE); r(2, 22, 4, 6, TAN); r(6, 22, 2, 6, EDGE);
    r(8, 22, 16, 6, TAN);
    r(24, 22, 2, 6, EDGE); r(26, 22, 4, 6, TAN); r(30, 22, 2, 6, EDGE);
    r(2, 28, 6, 2, EDGE); r(8, 28, 4, 2, TAN); r(12, 28, 8, 2, EDGE);
    r(20, 28, 4, 2, TAN); r(24, 28, 6, 2, EDGE);
    r(6, 30, 2, 2, EDGE); r(8, 30, 4, 2, TAN); r(12, 30, 2, 2, EDGE);
    r(18, 30, 2, 2, EDGE); r(20, 30, 4, 2, TAN); r(24, 30, 2, 2, EDGE);
    return cv.toDataURL("image/png");
}

// Load the player sprite, then start the game once the asset is ready so
// k.sprite() has the image available.
k.loadSprite("player.png", "assets/player.png");
for (const dir of ["down", "up", "left", "right"]) {
    k.loadSprite(`player-${dir}.png`, makePlayerSprite(dir));
}
k.loadSprite("lamp.png", "assets/lamp.png");
k.loadSprite("wisp.png", "assets/wisp.png");
k.onLoad(() => {
    const ui = createUI(k);
    window.ui = ui;
    const player = createPlayer(k);
    window.player = player;
    setupInteraction(k, player);

    createBackground(k, player);

    // Lighting system: darkness overlay with smooth radial holes around lights.
    const lighting = createLighting(k);
    window.lighting = lighting;

    // The player casts a shadow from any active light.
    lighting.registerShadowCaster(player);

    // Expose factories for testing (tests create objects at runtime).
    // Naming convention: <room>.<type>.<name>
    window.createNarrative = (id, pos, ui) => createNarrative(k, id, pos, ui);
    window.createLight = (id, pos) => createLight(k, id, pos, lighting);
    window.createStat = (id, pos, player) => createStat(k, id, pos, player);
    window.createLightDirector = (id, lamp) => createLightDirector(k, id, lamp, lighting, player);
    window.createLightSwitch = (id, pos, lamp) => createLightSwitch(k, id, pos, lamp);

    // Room manager: builds rooms from the data-driven registry and
    // handles door transitions.
    const rooms = createRooms(k, player, lighting, ui);
    window.rooms = rooms;
});
