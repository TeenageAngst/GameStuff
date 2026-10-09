import { createPlayer } from './src/player.js';
import { setupInteraction } from './src/interaction.js';
import { createUI } from './src/ui.js';
import { createNarrative, createLight, createStat } from './src/objects.js';
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

// Load the player sprite, then start the game once the asset is ready so
// k.sprite() has the image available.
k.loadSprite("player.png", "assets/player.png");
k.loadSprite("lamp.png", "assets/lamp.png");
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

    // Room manager: builds rooms from the data-driven registry and
    // handles door transitions.
    const rooms = createRooms(k, player, lighting, ui);
    window.rooms = rooms;
});
