export function createUI(k) {
    // NOTE: This kaplay build (3001.0.19) has no `visible` property on game
    // objects, so we hide/show the message box and text via `opacity`
    // (0 = hidden, 1 = shown).
    const PADDING = 16;
    const MAX_TEXT_WIDTH = 500;
    const FONT_SIZE = 24;

    // Offscreen canvas used to measure text with the same font the text
    // component renders with (monospace, 24px). This build has no k.font /
    // k.measureText, so we measure via the standard 2D canvas API.
    const measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = `${FONT_SIZE}px monospace`;

    function textWidth(str) {
        return measureCtx.measureText(str).width;
    }

    // Greedy word-wrap within MAX_TEXT_WIDTH, matching how the text
    // component wraps. Used to find the widest rendered line.
    function wrapLines(message) {
        const words = message.split(" ");
        const lines = [];
        let current = "";
        for (const word of words) {
            const candidate = current ? current + " " + word : word;
            if (!current || textWidth(candidate) <= MAX_TEXT_WIDTH) {
                current = candidate;
            } else {
                lines.push(current);
                current = word;
            }
        }
        if (current) lines.push(current);
        return lines;
    }

    const msgBox = k.add([
        k.rect(1, 1),
        k.pos(k.width() / 2, k.height() - 100),
        k.anchor("center"),
        k.color(0, 0, 0),
        k.opacity(0),
        k.area(),
    ]);

    const text = k.add([
        k.text("", { size: FONT_SIZE, width: MAX_TEXT_WIDTH, align: "center" }),
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

            text.text = message;
            text.opacity = 1;
            msgBox.opacity = 1;

            // Width = widest wrapped line (measured), height = the text
            // component's actual rendered height (line count * line height).
            const lines = wrapLines(message);
            const widest = Math.max(...lines.map(textWidth));

            // Defer to the next frame so text.height reflects the wrapped
            // layout before we size the box.
            k.wait(0, () => {
                if (id !== currentMessageId) return;
                msgBox.width = widest + PADDING * 2;
                msgBox.height = text.height + PADDING * 2;
            });

            k.wait(5, () => {
                if (id === currentMessageId) {
                    msgBox.opacity = 0;
                    text.opacity = 0;
                }
            });
        }
    };
}
