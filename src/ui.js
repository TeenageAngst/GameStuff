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

    // ---- Player stats HUD (top-left, fixed to screen) ----
    // Health in hearts, fight in boxing gloves, courage in swords.
    // Each stat renders as its icon repeated N times (Zelda-style).
    const STAT_ICONS = { health: "\u2764\uFE0F", fight: "\uD83E\uDD4A", courage: "\u2694\uFE0F" };
    const STAT_SIZE = 28;
    const STAT_GAP = 8;

    const statBg = k.add([
        k.rect(1, 1),
        k.pos(PADDING, PADDING),
        k.anchor("topleft"),
        k.color(0, 0, 0),
        k.opacity(0.5),
        k.fixed(),
    ]);

    const statTexts = {};
    const statOrder = ["health", "fight", "courage"];
    statOrder.forEach((key, i) => {
        statTexts[key] = k.add([
            k.text("", { size: STAT_SIZE }),
            k.pos(PADDING + 8, PADDING + 8 + i * (STAT_SIZE + STAT_GAP)),
            k.anchor("topleft"),
            k.color(255, 255, 255),
            k.fixed(),
        ]);
    });

    function renderStats(stats) {
        let maxW = 0;
        for (const key of statOrder) {
            const n = Math.max(0, Math.floor(stats[key] ?? 0));
            const str = n > 0 ? STAT_ICONS[key].repeat(n) : `\u2014`;
            statTexts[key].text = str;
            // Defer width measurement a frame so the text layout settles.
            maxW = Math.max(maxW, str.length * STAT_SIZE * 0.9);
        }
        const rowsH = statOrder.length * STAT_SIZE + (statOrder.length - 1) * STAT_GAP;
        statBg.width = maxW + 16;
        statBg.height = rowsH + 16;
    }

    return {
        // Exposed for testability (tests observe opacity/text state).
        msgBox,
        text,
        statTexts,
        // Re-render the stats HUD. Call whenever player.stats changes.
        updateStats: (stats) => renderStats(stats),
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
