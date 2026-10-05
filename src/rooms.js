import { createNarrativeObject, createEnvironmentObject, createStatObject } from './objects.js';

// Room manager: two rooms connected by doors, with a fade transition.
//
// Room "main": the original scene (3 interactable objects) plus a door at
// the bottom center leading to the empty room. Dark (default lighting).
// Room "empty": a well-lit, clearly defined empty room (bright floor +
// darker walls) containing only a single door at the top center that leads
// back to the main room.
//
// Transition: fade to black, destroy the current room's objects, build the
// target room, reposition the player, adjust the lighting darkness, then
// fade back in. The player is frozen for the duration of the transition.

const FADE_TIME = 0.4; // seconds per half of the transition (out and in)
const MAIN_DARKNESS = 0.65; // matches the lighting system's default
const EMPTY_DARKNESS = 0; // fully lit

export function createRooms(k, player, lighting, ui) {
    const W = k.width();
    const H = k.height();

    let currentRoom = null;
    let targetRoom = null;
    let transitioning = false;
    let fadeTarget = 0;
    let pendingMessage = null;
    let roomObjects = [];

    // Full-screen fade overlay, above all game objects.
    const fade = k.add([
        k.rect(W, H),
        k.pos(0, 0),
        k.color(0, 0, 0),
        k.opacity(0),
        k.z(100),
    ]);

    // Creates a door (interactable) plus its frame and handle. Interacting
    // with it (E while colliding) starts the transition to targetRoom.
    function createDoor(pos, target, arrivalMessage) {
        const door = k.add([
            k.rect(48, 64),
            k.pos(pos),
            k.color(139, 69, 19),
            k.area(),
            k.body({ isStatic: true }),
            "interactable",
            {
                isDoor: true,
                interact: () => {
                    transitionTo(target, arrivalMessage);
                },
            }
        ]);
        // Frame sits just behind the door; handle on the right edge.
        const frame = k.add([
            k.rect(56, 72),
            k.pos(pos[0] - 4, pos[1] - 4),
            k.color(80, 40, 20),
            k.z(-1),
        ]);
        const handle = k.add([
            k.circle(4),
            k.pos(pos[0] + 38, pos[1] + 32),
            k.color(255, 215, 0),
            k.z(1),
        ]);
        door.frame = frame;
        door.handle = handle;
        return door;
    }

    function buildMainRoom() {
        roomObjects = [];
        roomObjects.push(createNarrativeObject(k, [200, 200], "The air feels heavy here...", ui));
        roomObjects.push(createEnvironmentObject(k, [400, 200], lighting));
        roomObjects.push(createStatObject(k, [600, 200], player));
        const door = createDoor([W / 2 - 24, H - 88], "empty", "A bright, empty room. A single door leads back.");
        roomObjects.push(door, door.frame, door.handle);
    }

    function buildEmptyRoom() {
        roomObjects = [];
        const WALL = 24;
        // Floor: a large, bright, clearly defined surface.
        roomObjects.push(k.add([
            k.rect(W - WALL * 2, H - WALL * 2),
            k.pos(WALL, WALL),
            k.color(235, 228, 210),
            k.z(-50),
        ]));
        // Walls: a darker border framing the room.
        const wallColor = [110, 100, 90];
        roomObjects.push(k.add([k.rect(W, WALL), k.pos(0, 0), k.color(wallColor), k.z(-40)]));
        roomObjects.push(k.add([k.rect(W, WALL), k.pos(0, H - WALL), k.color(wallColor), k.z(-40)]));
        roomObjects.push(k.add([k.rect(WALL, H), k.pos(0, 0), k.color(wallColor), k.z(-40)]));
        roomObjects.push(k.add([k.rect(WALL, H), k.pos(W - WALL, 0), k.color(wallColor), k.z(-40)]));
        // The only thing in the room: a door back to the main room.
        const door = createDoor([W / 2 - 24, WALL], "main", "Back where you started.");
        roomObjects.push(door, door.frame, door.handle);
    }

    function destroyRoom() {
        for (const obj of roomObjects) {
            // Unregister light sources before destroying so the lighting
            // system never iterates over a destroyed object.
            if (obj.lightOn !== undefined) {
                lighting.unregister(obj);
            }
            obj.destroy();
        }
        roomObjects = [];
    }

    function placePlayer(room) {
        // This kaboom build exposes pos as a plain {x, y} object (no .set()),
        // so assign the components directly (matches how player.js clamps pos).
        if (room === "empty") {
            // Enter near the bottom, well clear of the top door.
            player.pos.x = W / 2;
            player.pos.y = H - 120;
        } else {
            // Enter just above the bottom door.
            player.pos.x = W / 2;
            player.pos.y = H - 140;
        }
    }

    function transitionTo(target, arrivalMessage) {
        if (transitioning) return;
        transitioning = true;
        targetRoom = target;
        pendingMessage = arrivalMessage;
        fadeTarget = 1;
        player.frozen = true;
    }

    k.onUpdate(() => {
        if (!transitioning) return;
        const step = k.dt() / FADE_TIME;
        if (fadeTarget === 1) {
            // Fading out.
            fade.opacity = Math.min(1, fade.opacity + step);
            if (fade.opacity >= 1) {
                // Fully hidden: swap the room.
                destroyRoom();
                if (targetRoom === "empty") {
                    buildEmptyRoom();
                    lighting.setDarkness(EMPTY_DARKNESS);
                } else {
                    buildMainRoom();
                    lighting.setDarkness(MAIN_DARKNESS);
                }
                currentRoom = targetRoom;
                placePlayer(targetRoom);
                fadeTarget = 0;
            }
        } else {
            // Fading in.
            fade.opacity = Math.max(0, fade.opacity - step);
            if (fade.opacity <= 0) {
                transitioning = false;
                player.frozen = false;
                if (pendingMessage) {
                    ui.show(pendingMessage);
                    pendingMessage = null;
                }
            }
        }
    });

    // Start in the main room.
    buildMainRoom();
    currentRoom = "main";
    lighting.setDarkness(MAIN_DARKNESS);

    return {
        get currentRoom() {
            return currentRoom;
        },
        isTransitioning: () => transitioning,
    };
}
