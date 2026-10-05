export function createNarrativeObject(k, pos, message, ui) {
    return k.add([
        k.rect(32, 32),
        k.pos(pos),
        k.color(0, 255, 0),
        k.area(),
        k.body({ isStatic: true }),
        "interactable",
        {
            interact: () => {
                ui.show(message);
            }
        }
    ]);
}

// Creates a light-source object. When toggled on (via interact), it
// illuminates the scene within the lighting system's radius; when off, the
// scene returns to darkness. The lighting system handles the actual glow.
export function createEnvironmentObject(k, pos, lighting) {
    const light = k.add([
        k.rect(32, 32),
        k.pos(pos),
        k.color(255, 255, 0),
        k.area(),
        k.body({ isStatic: true }),
        "interactable",
        {
            lightOn: false,
            interact: () => {
                light.lightOn = !light.lightOn;
            },
        }
    ]);

    if (lighting) {
        lighting.register(light);
    }

    return light;
}

export function createStatObject(k, pos, player) {
    if (!player || typeof player.speed === 'undefined') {
        console.error('Invalid player object provided to createStatObject');
        return null;
    }
    return k.add([
        k.rect(32, 32),
        k.pos(pos),
        k.color(255, 0, 0),
        k.area(),
        k.body({ isStatic: true }),
        "interactable",
        {
            interact: () => {
                player.speed = player.speed === 200 ? 100 : 200;
            }
        }
    ]);
}
