# Surreal Exploration PoC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use [executing-plans] mode to implement this plan task-by-task.

**Goal:** Implement a minimal Proof of Concept to validate narrative delivery, environmental manipulation, and player state alteration using Kaboom.js.

**Architecture:** A single-scene 2D top-down environment. A central `Player` entity interacts with `Interactable` objects via collision and a key press. State is managed through global variables and entity properties.

**Tech Stack:** Kaboom.js, HTML5, JavaScript.

---

## Project Structure
```text
/
├── index.html              # Entry point
├── main.js                 # Game initialization and scene setup
└── src/
    ├── player.js           # Player entity and movement logic
    ├── interaction.js      # Interaction system and collision logic
    ├── objects.js          # Narrative, Environment, and Stat object definitions
    └── ui.js               # UI/Text overlay management
```

---

## Implementation Tasks

### Task 1: Project Setup & Basic Init

**Files:**
- Create: `index.html`
- Create: `main.js`

**Step 1: Create `index.html`**
```html
<!DOCTYPE html>
<html>
<head>
    <title>Surreal Exploration PoC</title>
</head>
<body>
    <script src="https://unpkg.com/kaboom@3000.0.1/dist/kaboom.js"></script>
    <script src="main.js"></script>
</body>
</html>
```

**Step 2: Create `main.js` with basic init**
```javascript
kaboom({
    background: [0, 0, 0],
    width: 800,
    height: 600,
});

add([
    text("PoC Initialized - Press Space to Start"),
    pos(center()),
    anchor("center"),
]);
```

**Step 3: Verify initialization**
Run: `npx serve .` (or open `index.html` in browser)
Expected: Black screen with "PoC Initialized - Press Space to Start" text.

**Step 4: Commit**
`git add . && git commit -m "chore: project setup and kaboom init"`

---

### Task 2: Player Controller

**Files:**
- Create: `src/player.js`
- Modify: `main.js`

**Step 1: Implement Player Entity in `src/player.js`**
```javascript
export function createPlayer() {
    const player = add([
        rect(32, 32),
        pos(center()),
        color(0, 0, 255),
        area(),
        body(),
        {
            speed: 200,
        }
    ]);

    onKeyDown("left", () => {
        player.move(-player.speed, 0);
    });
    onKeyDown("right", ()
    });
    onKeyDown("up", () => {
        player.move(0, -player.speed);
    });
    onKeyDown("down", () => {
        player.move(0, player.speed);
    });

    return player;
}
```
*(Correction: Fixed syntax error in `onKeyDown("right")`)*
```javascript
export function createPlayer() {
    const player = add([
        rect(32, 32),
        pos(center()),
        color(0, 0, 255),
        area(),
        body(),
        {
            speed: 200,
        }
    ]);

    onKeyDown("left", () => {
        player.move(-player.speed, 0);
    });
    onKeyDown("right", () => {
        player.move(player.speed, 0);
    });
    onKeyDown("up", () => {
        player.move(0, -player.speed);
    });
    onKeyDown("down", () => {
        player.move(0, player.speed);
    });

    return player;
}
```

**Step 2: Integrate Player into `main.js`**
```javascript
import { createPlayer } from './src/player.js';

kaboom({
    background: [0, 0, 0],
    width: 800,
    height: 600,
});

createPlayer();
```

**Step 3: Run Movement Test**
Run: `npx serve .`
Expected: Blue square moves in 4 directions using arrow keys.

**Step 4: Commit**
`git add . && git commit -m "feat: implement player controller"`

---

### Task 3: Interaction System

**Files:**
- Create: `src/interaction.js`
- Modify: `main.js`

**Step 1: Implement Interaction Logic in `src/interaction.js`**
```javascript
export function setupInteraction(player) {
    onKeyPress("e", () => {
        const interactables = get("interactable");
        interactables.forEach((obj) => {
            if (player.isColliding(obj)) {
                obj.interact();
            }
        });
    });
}
```

**Step 2: Integrate Interaction into `main.js`**
```javascript
import { createPlayer } from './src/player.js';
import { setupInteraction } from './src/interaction.js';

kaboom({
    background: [0, 0, 0],
    width: 800,
    height: 600,
});

const player = createPlayer();
setupInteraction(player);
```

**Step 3: Commit**
`git add . && git commit -m "feat: implement interaction system"`

---

### Task 4: Narrative Object & UI

**Files:**
- Create: `src/ui.js`
- Modify: `src/objects.js`
- Modify: `main.js`

**Step 1: Implement UI Overlay in `src/ui.js`**
```javascript
export function createUI() {
    const msgBox = add([
        rect(400, 100),
        pos(width() / 2, height() - 100),
        anchor("center"),
        color(0, 0, 0),
        opacity(0.8),
        area(),
        {
            visible: false
        }
    ]);

    const text = add([
        text({ size: 24 }),
        pos(width() / 2, height() - 100),
        anchor("center"),
        color(255, 255, 255),
        {
            visible: false
        }
    ]);

    return {
        show: (message) => {
            msgBox.visible = true;
            text.text = message;
            text.visible = true;
            wait(3, () => {
                msgBox.visible = false;
                text.visible = false;
            });
        }
    };
}
```

**Step 2: Implement Narrative Object in `src/objects.js`**
```javascript
export function createNarrativeObject(pos, message, ui) {
    return add([
        rect(32, 32),
        pos(pos),
        color(0, 255, 0),
        area(),
        "interactable",
        {
            interact: () => {
                ui.show(message);
            }
        }
    ]);
}
```

**Step 3: Integrate into `main.js`**
```javascript
import { createPlayer } from './src/player.js';
import { setupInteraction } from './src/interaction.js';
import { createUI } from './src/ui.js';
import { createNarrativeObject } from './src/objects.js';

kaboom({
    background: [0, 0, 0],
    width: 800,
    height: 600,
});

const ui = createUI();
const player = createPlayer();
setupInteraction(player);

createNarrativeObject([200, 200], "The air feels heavy here...", ui);
```

**Step 4: Run Text Test**
Run: `npx serve .`
Expected: Player moves to green square, presses 'E', text "The air feels heavy here..." appears for 3 seconds.

**Step 5: Commit**
`git add . && git commit -m "feat: implement narrative object and UI"`

---

### Task 5: Environment Object

**Files:**
- Modify: `src/objects.js`
- Modify: `main.js`

**Step 1: Implement Environment Object in `src/objects.js`**
```javascript
export function createEnvironmentObject(pos) {
    let lightOn = false;
    return add([
        rect(32, 32),
        pos(pos),
        color(255, 255, 0),
        area(),
        "interactable",
        {
            interact: () => {
                lightOn = !lightOn;
                bg(lightOn ? [50, 50, 50] : [0, 0, 0]);
            }
        }
    ]);
}
```

**Step 2: Integrate into `main.js`**
```javascript
import { createEnvironmentObject } from './src/objects.js';
// ... other imports
createEnvironmentObject([400, 200]);
```

**Step 3: Run Light Test**
Run: `npx serve .`
Expected: Player moves to yellow square, presses 'E', background toggles between black and dark grey.

**Step 4: Commit**
`git add . && git commit -m "feat: implement environment object"`

---

### Task 6: Stat Object

**Files:**
- Modify: `src/objects.js`
- Modify: `main.js`

**Step 1: Implement Stat Object in `src/objects.js`**
```javascript
export function createStatObject(pos, player) {
    let fast = true;
    return add([
        rect(32, 32),
        pos(pos),
        color(255, 0, 0),
        area(),
        "interactable",
        {
            interact: () => {
                fast = !fast;
                player.speed = fast ? 200 : 100;
            }
        }
    ]);
}
```

**Step 2: Integrate into `main.js`**
```javascript
import { createStatObject } from './src/objects.js';
// ... other imports
createStatObject([600, 200], player);
```

**Step 3: Run Speed Test**
Run: `npx serve .`
Expected: Player moves to red square, presses 'E', movement speed noticeably decreases/increases.

**Step 4: Commit**
`git add . && git commit -m "feat: implement stat object"`

---

## Verification Suite

| Test Case | Action | Expected Result | Design Doc Ref |
| :--- | :--- | :--- | :--- |
| **Movement Test** | Use Arrow Keys | Player moves in 4 directions | Testing Plan #1 |
| **Text Test** | Collide with Green $\rightarrow$ 'E' | Text overlay appears with message | Testing Plan #2 |
| **Light Test** | Collide with Yellow $\rightarrow$ 'E' | Background color changes | Testing Plan #3 |
| **Speed Test** | Collide with Red $\rightarrow$ 'E' | Player movement speed changes | Testing Plan #4 |

---

## Review Checkpoints

1. **Checkpoint 1: Basic Loop** - After Task 2. Verify player movement is fluid.
2. **Checkpoint 2: Interaction** - After Task 3. Verify collision detection is working (can be verified by adding a `console.log` in `interact()`).
3. **Checkpoint 3: Pillar Validation** - After Task 6. Run the full Verification Suite.
