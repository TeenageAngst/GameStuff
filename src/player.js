export function createPlayer(k) {
    const player = k.add([
        k.sprite("player-down.png"),
        k.anchor("center"),
        k.pos(k.center()),
        k.area(),
        k.body(),
        {
            speed: 200,
            // Inset the shadow silhouette so it hugs the opaque pixels
            // instead of the rect's transparent corners/margins.
            shadowInset: 3,
            // Which way the player is facing; sprite swaps to match.
            facing: "down",
        }
    ]);

    player.onCollide("interactable", () => {
        console.log("Collision detected with interactable!");
    });

    // Keep the player inside the current room's bounds.
    function clampToRoom() {
        const halfW = 16;
        const halfH = 16;
        const [roomW, roomH] = window.rooms.currentRoomDimensions;
        if (player.pos.x < halfW) {
            player.pos.x = halfW;
        }
        if (player.pos.x > roomW - halfW) {
            player.pos.x = roomW - halfW;
        }
        if (player.pos.y < halfH) {
            player.pos.y = halfH;
        }
        if (player.pos.y > roomH - halfH) {
            player.pos.y = roomH - halfH;
        }
    }

    // Collision resolution runs after onUpdate and can push the player
    // past the room edge (e.g. out through the east door, which sits flush
    // with the wall), so clamp again once physics has resolved.
    player.onPhysicsResolve(() => {
        clampToRoom();
    });

    // Swap the sprite to face a new direction (no-op if unchanged).
    function setFacing(dir) {
        if (player.facing === dir) return;
        player.facing = dir;
        player.use(k.sprite(`player-${dir}.png`));
    }
    k.onUpdate(() => {
        // Frozen during room transitions (set by the room manager).
        if (player.frozen) return;

        let dx = 0;
        let dy = 0;

        if (k.isKeyDown("left")) dx -= 1;
        if (k.isKeyDown("right")) dx += 1;
        if (k.isKeyDown("up")) dy -= 1;
        if (k.isKeyDown("down")) dy += 1;

        if (dx !== 0 || dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            player.move((dx / length) * player.speed, (dy / length) * player.speed);
            // Face the dominant movement axis; keeps last facing when idle.
            if (Math.abs(dx) >= Math.abs(dy)) {
                setFacing(dx < 0 ? "left" : "right");
            } else {
                setFacing(dy < 0 ? "up" : "down");
            }
        }

        clampToRoom();
    });

    return player;
}
