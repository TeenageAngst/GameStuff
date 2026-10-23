export function setupInteraction(k, player) {
    k.onKeyPress("e", () => {
        const interactable = k.get("interactable").find((obj) => player.isColliding(obj));
        // Only objects with an interact() handler respond to E; anything
        // else sharing the tag is ignored instead of throwing.
        if (interactable && typeof interactable.interact === "function") {
            interactable.interact();
        }
    });
}
