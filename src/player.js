export function createPlayer(k) {
    const player = k.add([
        k.sprite("player.png"),
        k.anchor("center"),
        k.pos(k.center()),
        k.area(),
        k.body(),
        {
            speed: 200,
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
        if (player.pos.x < halfW) {
            player.pos.x = halfW;
        }
        if (player.pos.x > k.width() - halfW) {
            player.pos.x = k.width() - halfW;
        }
        if (player.pos.y < halfH) {
            player.pos.y = halfH;
        }
        if (player.pos.y > k.height() - halfH) {
            player.pos.y = k.height() - halfH;
        }
    });

    return player;
}
