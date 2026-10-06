// Central text registry.
//
// Keys follow the naming convention: <room>.<type>.<name>
// e.g. "main.narrative.air" → narrative text for the air object in the main room.
//
// To add a new text:
//   1. Choose a key following the convention
//   2. Add it to this registry
//   3. Reference the key in the object factory call (src/objects.js)

export const TEXTS = {
    "main.narrative.air": "The air feels heavy here...",
    "main.door.south": "A bright, empty room. A single door leads back.",
    "empty.door.north": "Back where you started.",
};
