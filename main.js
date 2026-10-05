import { createPlayer } from './src/player.js';
import { setupInteraction } from './src/interaction.js';
import { createUI } from './src/ui.js';
import { createNarrativeObject, createEnvironmentObject, createStatObject } from './src/objects.js';
import { createBackground } from './src/background.js';
import { createLighting } from './src/lighting.js';
import { createRooms } from './src/rooms.js';

const k = kaboom({
    background: [0, 0, 0],
    width: 800,
    height: 600,
    gravity: 0,
});

window.k = k;

// Load the player sprite, then start the game once the asset is ready so
// k.sprite() has the image available.
k.loadSprite("player.png", "assets/player.png");
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

    window.createNarrativeObject = (pos, msg, ui) => createNarrativeObject(k, pos, msg, ui);
    window.createEnvironmentObject = (pos) => createEnvironmentObject(k, pos, lighting);
    window.createStatObject = (pos, player) => createStatObject(k, pos, player);

    // Room manager: builds the main room (3 interactables + a door) and
    // handles door transitions to the empty room.
    const rooms = createRooms(k, player, lighting, ui);
    window.rooms = rooms;
});
