import { createNarrative, createLight, createStat } from './objects.js';
import { TEXTS } from './texts.js';

// Room manager: builds rooms from a data-driven registry, with fade transitions.
//
// Naming convention: <room>.<type>.<name>
//   - Room IDs: ROOM_IDS.MAIN, ROOM_IDS.EMPTY
//   - Object tags: "main.narrative.air", "main.door.south", etc.
//   - Text keys: same as object tags, looked up in TEXTS (src/texts.js)
//
// Adding a new room:
//   1. Add an ID to ROOM_IDS
//   2. Add an entry to ROOMS with { darkness, build, playerPos }
//   3. Add any text keys to TEXTS in src/texts.js

const FADE_TIME = 0.4; // seconds per half of the transition (out and in)

export const ROOM_IDS = {
    MAIN: "main",
    EMPTY: "empty",
};

// Data-driven room registry. Each entry defines:
//   darkness  – lighting darkness level (0 = fully lit, 1 = fully dark)
//   build     – (k, ctx) => objects[]; creates the room's objects
//   playerPos – (W, H) => [x, y]; where to place the player on entry
const ROOMS = {
    [ROOM_IDS.MAIN]: {
        darkness: 0.65,
        build(k, ctx) {
            const { W, H, player, lighting, ui, createDoor } = ctx;
            const objects = [];
            objects.push(createNarrative(k, "main.narrative.air", [200, 200], ui));
            objects.push(createLight(k, "main.environment.light", [400, 200], lighting));
            objects.push(createStat(k, "main.stat.speed", [600, 200], player));
            const door = createDoor("main.door.south", [W / 2 - 24, H - 88], ROOM_IDS.EMPTY);
            objects.push(door, door.frame, door.handle);
            return objects;
        },
        playerPos(W, H) {
            // Enter just above the bottom door.
            return [W / 2, H - 140];
        },
    },
    [ROOM_IDS.EMPTY]: {
        darkness: 0,
        build(k, ctx) {
            const { W, H, createDoor } = ctx;
            const objects = [];
            const WALL = 24;
            // Floor: a large, bright, clearly defined surface.
            objects.push(k.add([
                k.rect(W - WALL * 2, H - WALL * 2),
                k.pos(WALL, WALL),
                k.color(235, 228, 210),
                k.z(-50),
            ]));
            // Walls: a darker border framing the room.
            const wallColor = [110, 100, 90];
            objects.push(k.add([k.rect(W, WALL), k.pos(0, 0), k.color(wallColor), k.z(-40)]));
            objects.push(k.add([k.rect(W, WALL), k.pos(0, H - WALL), k.color(wallColor), k.z(-40)]));
            objects.push(k.add([k.rect(WALL, H), k.pos(0, 0), k.color(wallColor), k.z(-40)]));
            objects.push(k.add([k.rect(WALL, H), k.pos(W - WALL, 0), k.color(wallColor), k.z(-40)]));
            // The only thing in the room: a door back to the main room.
            const door = createDoor("empty.door.north", [W / 2 - 24, WALL], ROOM_IDS.MAIN);
            objects.push(door, door.frame, door.handle);
            return objects;
        },
        playerPos(W, H) {
            // Enter just below the north door (door spans y=24..88).
            return [W / 2, 140];
        },
    },
};

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

    // Creates a door (interactable) plus its frame and handle.
    // `id` follows the convention: <room>.<type>.<name> e.g. "main.door.south"
    // `target` is the ROOM_IDS value of the room this door leads to.
    // The arrival message is looked up from TEXTS by `id`.
    function createDoor(id, pos, target) {
        const room = id.split('.')[0];
        const arrivalMessage = TEXTS[id];
        const door = k.add([
            k.rect(48, 64),
            k.pos(pos),
            k.color(139, 69, 19),
            k.area(),
            k.body({ isStatic: true }),
            "interactable",
            id,
            `room:${room}`,
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

    function buildRoom(roomId) {
        roomObjects = [];
        const room = ROOMS[roomId];
        const ctx = { W, H, player, lighting, ui, createDoor };
        const objects = room.build(k, ctx);
        roomObjects.push(...objects);
        // Register interactable objects as shadow casters so they block light
        // and cast shadows. The light source itself is skipped (it emits, not
        // blocks).
        for (const obj of objects) {
            if (obj.has && obj.has("interactable") && obj.lightOn === undefined) {
                lighting.registerShadowCaster(obj);
            }
        }
    }

    function destroyRoom() {
        for (const obj of roomObjects) {
            // Unregister light sources before destroying so the lighting
            // system never iterates over a destroyed object.
            if (obj.lightOn !== undefined) {
                lighting.unregister(obj);
            }
            // Unregister shadow casters for the same reason.
            if (obj.has && obj.has("interactable") && obj.lightOn === undefined) {
                lighting.unregisterShadowCaster(obj);
            }
            obj.destroy();
        }
        roomObjects = [];
    }

    function placePlayer(roomId) {
        // This kaplay build exposes pos as a plain {x, y} object (no .set()),
        // so assign the components directly (matches how player.js clamps pos).
        const [x, y] = ROOMS[roomId].playerPos(W, H);
        player.pos.x = x;
        player.pos.y = y;
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
                buildRoom(targetRoom);
                lighting.setDarkness(ROOMS[targetRoom].darkness);
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
    buildRoom(ROOM_IDS.MAIN);
    currentRoom = ROOM_IDS.MAIN;
    lighting.setDarkness(ROOMS[ROOM_IDS.MAIN].darkness);

    return {
        get currentRoom() {
            return currentRoom;
        },
        isTransitioning: () => transitioning,
    };
}
