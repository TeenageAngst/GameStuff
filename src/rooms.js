import { createNarrative, createLight, createStat, createLightDirector, createLightSwitch, createEnemy } from './objects.js';
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
    HALLWAY1: "hallway1",
};

// Data-driven room registry. Each entry defines:
//   darkness  – lighting darkness level (0 = fully lit, 1 = fully dark)
//   build     – (k, ctx) => objects[]; creates the room's objects
//   playerPos – (W, H) => [x, y]; where to place the player on entry
const ROOMS = {
    [ROOM_IDS.MAIN]: {
        width: null, // Use default W
        height: null, // Use default H
        darkness: 0.65,
        build(k, ctx) {
            const { W, H, player, lighting, ui, createDoor } = ctx;
            const objects = [];
            objects.push(createNarrative(k, "main.narrative.air", [200, 200], ui));
            objects.push(createLight(k, "main.environment.light", [400, 200], lighting));
            objects.push(createStat(k, "main.stat.speed", [600, 200], player));
            const doorSouth = createDoor("main.door.south", [W / 2 - 24, H - 88], ROOM_IDS.EMPTY);
            objects.push(doorSouth, doorSouth.frame, doorSouth.handle);

            const doorEast = createDoor("main.door.east", [W - 48, H / 2 - 32], ROOM_IDS.HALLWAY1);
            objects.push(doorEast, doorEast.frame, doorEast.handle);

            return objects;
        },
        playerPos(W, H) {
            // Enter just above the bottom door.
            return [W / 2, H - 140];
        },
    },
    [ROOM_IDS.EMPTY]: {
        width: null, // Use default W
        height: null, // Use default H
        darkness: 0.7,
        build(k, ctx) {
            const { W, H, createDoor, lighting, player } = ctx;
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
            // Two colored lamps placed close together so their pools overlap
            // significantly. The room is dark, so each lamp carves out a pool
            // of its own color; where the pools overlap the hues blend.
            objects.push(createLight(k, "empty.light.green", [W * 0.40, H * 0.45], lighting, [80, 255, 120]));
            // The red lamp lives inside the director housing, so it can't be
            // toggled directly — the wall switch beside the door owns it.
            const redLamp = createLight(k, "empty.light.red", [W * 0.60, H * 0.45], lighting, [255, 70, 60]);
            redLamp.directToggle = false;
            // Render above the director housing (added later, so it would
            // otherwise cover the lamp sprite).
            redLamp.z = 1;
            objects.push(redLamp);
            // Wall switch for the red lamp, on the north wall by the door.
            objects.push(...createLightSwitch(k, "empty.switch.red", [W / 2 + 60, WALL / 2], redLamp));
            // A light director: a small ring housing around the red lamp with a
            // single aperture. The player pushes the housing to spin it,
            // sweeping the beam around the room.
            objects.push(...createLightDirector(k, "empty.director.main", redLamp, lighting, player));
            // A door back to the main room.
            const door = createDoor("empty.door.north", [W / 2 - 24, WALL], ROOM_IDS.MAIN);
            objects.push(door, door.frame, door.handle);
            return objects;
        },
        playerPos(W, H) {
            // Enter just below the north door (door spans y=24..88).
            return [W / 2, 140];
        },
    },
    [ROOM_IDS.HALLWAY1]: {
        width: 4000, // 800 * 5
        height: 300, // 600 * 0.5
        darkness: 0.7,
        build(k, ctx) {
            const { W, H, createDoor, lighting, player } = ctx;
            const roomW = 4000;
            const roomH = 300;
            const objects = [];
            const WALL = 24;

            // Floor
            objects.push(k.add([
                k.rect(roomW - WALL * 2, roomH - WALL * 2),
                k.pos(WALL, WALL),
                k.color(180, 170, 160),
                k.z(-50),
            ]));

            // Walls (tagged interactable so they block light and cast shadows)
            const wallColor = [80, 70, 60];
            objects.push(k.add([k.rect(roomW, WALL), k.pos(0, 0), k.color(wallColor), k.z(-40), "interactable", `room:${ROOM_IDS.HALLWAY1}`]));
            objects.push(k.add([k.rect(roomW, WALL), k.pos(0, roomH - WALL), k.color(wallColor), k.z(-40), "interactable", `room:${ROOM_IDS.HALLWAY1}`]));
            objects.push(k.add([k.rect(WALL, roomH), k.pos(0, 0), k.color(wallColor), k.z(-40), "interactable", `room:${ROOM_IDS.HALLWAY1}`]));
            objects.push(k.add([k.rect(WALL, roomH), k.pos(roomW - WALL, 0), k.color(wallColor), k.z(-40), "interactable", `room:${ROOM_IDS.HALLWAY1}`]));

            // Alternating lights, spaced so their glow circles (440px diameter)
            // somewhat overlap. 11 lamps × 320px spacing fills the hallway.
            const colors = [
                [255, 80, 80],    // red
                [255, 160, 60],   // orange
                [255, 230, 80],   // yellow
                [160, 255, 80],   // lime
                [80, 255, 120],   // green
                [80, 255, 200],   // teal
                [80, 220, 255],   // cyan
                [100, 160, 255],  // sky
                [120, 100, 255],  // blue
                [200, 100, 255],  // purple
                [255, 100, 200],  // pink
            ];
            const lightSpacing = 320;
            for (let i = 0; i < colors.length; i++) {
                const x = 300 + i * lightSpacing;
                const y = roomH / 2;
                const color = colors[i];
                const sideOffset = (i % 2 === 0) ? -40 : 40;
                const light = createLight(k, `hallway1.light.${i}`, [x, y + sideOffset], lighting, color);
                light.z = 1; // Ensure lights are visible above the floor
                objects.push(light);
            }

            // Moving walls: vertical pistons between every other lamp pair.
            // They oscillate up/down, block the player, and cast shadows.
            const wallXs = [780, 1420, 2060, 2700, 3340];
            const wallW = 40, wallH = 140;
            const wallBaseY = roomH / 2;
            const wallAmp = 80;
            wallXs.forEach((wx, wi) => {
                const wall = k.add([
                    k.rect(wallW, wallH),
                    k.pos(wx - wallW / 2, wallBaseY - wallH / 2),
                    k.anchor("topleft"),
                    k.color(70, 70, 80),
                    k.area(),
                    k.body({ isStatic: true }),
                    "interactable",
                    `hallway1.wall.${wi}`,
                    `room:${ROOM_IDS.HALLWAY1}`,
                ]);
                wall.z = 0;
                objects.push(wall);
                // Oscillate vertically with a per-wall phase offset.
                const phase = wi * 1.3;
                const speed = 1.2;
                let t = 0;
                k.onUpdate(() => {
                    // Only animate while this room is active.
                    if (wall.destroyed) return;
                    t += k.dt() * speed;
                    const y = wallBaseY + Math.sin(t + phase) * wallAmp - wallH / 2;
                    wall.pos.y = y;
                });
            });
            const door = createDoor("hallway1.door.west", [WALL, roomH / 2 - 32], ROOM_IDS.MAIN);
            objects.push(door, door.frame, door.handle);

            // Shadow wisps: patrolling enemies drifting between the piston
            // walls. They don't block light (they're made of shadow) — the
            // player has to time crossings around them.
            const wispDefs = [
                { x: 500, xRange: 140, speed: 0.70, phase: 0.0 },
                { x: 1150, xRange: 160, speed: 0.85, phase: 2.1 },
                { x: 1800, xRange: 150, speed: 0.65, phase: 4.2 },
                { x: 2450, xRange: 160, speed: 0.90, phase: 1.2 },
                { x: 3100, xRange: 150, speed: 0.75, phase: 3.3 },
            ];
            const enemies = wispDefs.map((def, i) =>
                createEnemy(k, `hallway1.enemy.wisp${i}`, player, {
                    x: def.x,
                    y: roomH / 2,
                    xRange: def.xRange,
                    yAmp: 55,
                    speed: def.speed,
                    phase: def.phase,
                })
            );
            objects.push(...enemies);

            // Shared enemy-hit feedback: decay the knockback velocity
            // (applied via move() so walls still block it) and blink the
            // player during the invulnerability window. Cancelled once the
            // room's enemies are gone (room transition).
            const knockUpdate = k.onUpdate(() => {
                if (enemies.every((e) => e.destroyed)) {
                    knockUpdate.cancel();
                    return;
                }
                const dt = k.dt();
                if ((player.knockVX || player.knockVY) && !player.frozen) {
                    // move() takes a velocity (px/s) and scales by dt itself.
                    player.move(player.knockVX, player.knockVY);
                    const decay = Math.exp(-5 * dt);
                    player.knockVX *= decay;
                    player.knockVY *= decay;
                    if (Math.hypot(player.knockVX, player.knockVY) < 8) {
                        player.knockVX = 0;
                        player.knockVY = 0;
                    }
                }
                player.opacity = (player.nextVulnAt && k.time() < player.nextVulnAt)
                    ? (Math.floor(k.time() * 14) % 2 === 0 ? 0.35 : 1)
                    : 1;
            });

            return objects;
        },
        playerPos(W, H) {
            return [150, 150];
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
            const hasInt = obj.tags && obj.tags.includes("interactable");
            if (hasInt && obj.lightOn === undefined) {
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
            if (obj.tags && obj.tags.includes("interactable") && obj.lightOn === undefined) {
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
        if (transitioning) {
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
        } else {
            // Camera follows player, clamped to room boundaries.
            const room = ROOMS[currentRoom];
            const roomW = room.width || W;
            const roomH = room.height || H;

            // Center camera on player, but clamp to room edges.
            const camX = Math.max(W / 2, Math.min(roomW - W / 2, player.pos.x));
            const camY = Math.max(H / 2, Math.min(roomH - H / 2, player.pos.y));
            
            // Use the standard Kaplay camPos function
            k.camPos(camX, camY);
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
        get currentRoomDimensions() {
            const room = ROOMS[currentRoom];
            return [room.width || W, room.height || H];
        },
        isTransitioning: () => transitioning,
    };
}
