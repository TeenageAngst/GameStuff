export function createPlayer(k) {
    const player = k.add([
        k.sprite("player.png"),
        k.anchor("center"),
        k.pos(k.center()),
        k.area(),
        k.body(),
        {
            speed: 200,
            // The sprite is a rounded square; inset the shadow silhouette so
            // it hugs the opaque pixels instead of the rect's square corners.
            shadowInset: 3,
        }
    ]);

    player.onCollide("interactable", () => {
        console.log("Collision detected with interactable!");
    });

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
        }

        // Boundary collision
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
    });

    return player;
}
