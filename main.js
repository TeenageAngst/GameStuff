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
// returns it as a data URL for k.loadSprite. Same rounded-square body as
// the original player.png, with two eyes toward the facing edge so the
// player reads as facing up/down/left/right.
function makePlayerSprite(facing) {
    const S = 32;
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const ctx = cv.getContext("2d");
    // Body
    ctx.fillStyle = "#e5c49d";
    ctx.strokeStyle = "#aa8f6f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(3.5, 3.5, S - 7, S - 7, 7);
    } else {
        ctx.rect(3.5, 3.5, S - 7, S - 7);
    }
    ctx.fill();
    ctx.stroke();
    // Eyes toward the facing edge
    ctx.fillStyle = "#3c2a1e";
    const eyes = {
        down:  [[10, 18, 5, 7], [18, 18, 5, 7]],
        up:    [[10, 8, 5, 7],  [18, 8, 5, 7]],
        left:  [[7, 10, 6, 5],  [7, 18, 6, 5]],
        right: [[20, 10, 6, 5], [20, 18, 6, 5]],
    }[facing];
    for (const [x, y, w, h] of eyes) ctx.fillRect(x, y, w, h);
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
