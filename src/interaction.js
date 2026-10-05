export function setupInteraction(k, player) {
    k.onKeyPress("e", () => {
        const interactable = k.get("interactable").find((obj) => player.isColliding(obj));
        if (interactable) {
            interactable.interact();
        }
    });
}
