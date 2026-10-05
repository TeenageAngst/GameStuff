export function createUI(k) {
    // NOTE: This kaboom build (3000.0.1) has no `visible` property on game
    // objects, so we hide/show the message box and text via `opacity`
    // (0 = hidden, 1 = shown).
    const msgBox = k.add([
        k.rect(400, 100),
        k.pos(k.width() / 2, k.height() - 100),
        k.anchor("center"),
        k.color(0, 0, 0),
        k.opacity(0),
        k.area(),
    ]);

    const text = k.add([
        k.text("", { size: 24 }),
        k.pos(k.width() / 2, k.height() - 100),
        k.anchor("center"),
        k.color(255, 255, 255),
        k.opacity(0),
    ]);

    let currentMessageId = 0;

    return {
        // Exposed for testability (tests observe opacity/text state).
        msgBox,
        text,
        show: (message) => {
            currentMessageId++;
            const id = currentMessageId;

            msgBox.opacity = 1;
            text.text = message;
            text.opacity = 1;

            k.wait(5, () => {
                if (id === currentMessageId) {
                    msgBox.opacity = 0;
                    text.opacity = 0;
                }
            });
        }
    };
}
