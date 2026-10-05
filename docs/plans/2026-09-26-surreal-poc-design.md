# Design Document: Surreal Exploration PoC

## 1. High-Level Concept
**Vision:** A minimal Proof of Concept (PoC) for a surreal, atmospheric exploration game. The goal is to validate three core technical pillars: delivering narrative information, manipulating the environment, and altering player state.

**Genre:** Atmospheric/Narrative Exploration
**Perspective:** 2D Top-Down
**Platform:** Web Browser (HTML5/JS)
**Technology Stack:** Kaboom.js

## 2. Technical Architecture
- **Engine:** Kaboom.js for rapid prototyping.
- **Scene Structure:** Single-room setup.
- **Player Controller:** Entity with movement logic driven by a `speed` variable.
- **Interaction System:** Proximity/Collision-based triggers. Interaction occurs when the player overlaps an object and presses the interaction key (e.g., 'E' or Space).
- **State Management:** Global variables for `lightState` (on/off) and `playerSpeedMultiplier`.

## 3. Components & Interaction Logic

### Interactive Objects
| Object | Trigger | Action | Purpose |
| :--- | :--- | :--- | :--- |
| **Narrative Object** | Interaction | Display text overlay/message box | Validate textual information delivery |
| **Environment Object** | Interaction | Toggle background color/light overlay | Validate environmental state changes |
| **Stat Object** | Interaction | Toggle `player.speed` (50% $\leftrightarrow$ 100%) | Validate dynamic player attribute alteration |

### Data Flow
`Player Input` $\rightarrow$ `Collision Check` $\rightarrow$ `Interaction Trigger` $\rightarrow$ `State Update` $\rightarrow$ `Visual/Behavioral Feedback`

## 4. Validation & Success Criteria

### Error Handling
- **Input Validation:** Interaction key only triggers during active collision.
- **State Bounds:** Speed modifier is clamped to prevent 0 or negative values.

### Testing Plan
- [ ] **Movement Test:** Player can move in all four directions.
- [ ] **Text Test:** Interacting with Narrative Object displays intended text.
- [ ] **Light Test:** Interacting with Environment Object changes room lighting.
- [ ] **Speed Test:** Interacting with Stat Object noticeably changes movement speed.

### Success Criteria
The PoC is successful when all four tests pass in a web browser, proving the core technical pillars are functional and ready for expansion.
