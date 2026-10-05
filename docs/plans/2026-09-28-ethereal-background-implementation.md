# Ethereal Background Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use [executing-plans] mode to implement this plan task-by-task.

**Goal:** Replace the static pulsing background with a procedurally generated, multi-layered ethereal nebula and particle system with parallax effects.

**Architecture:** 
The background will be implemented as a standalone module `src/background.js` using Kaboom.js primitives. It will maintain two pools of objects (nebulae and particles) that are updated every frame for drift, twinkling, and parallax offset relative to the player's position.

**Tech Stack:** Kaboom.js (Canvas API), JavaScript.

---

## Technical Architecture

### Layering (Z-Index)
- **Nebula Layer:** `z(-100)` - Large, slow-moving, semi-transparent colored circles.
- **Particle Layer:** `z(-90)` - Small, medium-speed, twinkling dots.
- **Game Objects:** `z(0)` - Player and interactive objects.

### Parallax Logic
The visual position of background elements will be calculated as:
`renderPos = actualPos + (playerPos * parallaxFactor)`
- Nebulae: `parallaxFactor` $\approx$ 0.1 (Slowest)
- Particles: `parallaxFactor` $\approx$ 0.3 (Medium)

---

## Implementation Steps

### Task 1: Background Module Setup
**Files:**
- Create: `src/background.js`
- Modify: `main.js`

**Step 1: Create the background module structure**
Create `src/background.js` with a `createBackground(k, player)` function.

**Step 2: Integrate into `main.js`**
- Import `createBackground` from `./src/background.js`.
- Remove the existing `loadSprite("background", ...)` and the `bg` object.
- Remove the `bg.scale` pulse logic from `k.onUpdate`.
- Call `createBackground(k, player)` after player initialization.

### Task 2: Nebula Implementation
**Files:**
- Modify: `src/background.js`

**Step 1: Implement Nebula Generation**
- Create a `nebulae` array.
- Loop 4-6 times to create `k.circle()` objects.
- Assign random colors from palette: `[deep purple, cyan, magenta]`.
- Assign random initial positions, velocities, and sizes (large).
- Set `z(-100)` and `opacity(0.3)`.

**Step 2: Implement Nebula Drift and Wrap**
- In `k.onUpdate`, update `nebula.pos` by `nebula.vel`.
- Implement wrap-around logic with a buffer (e.g., 200px) to prevent popping.

**Step 3: Implement Nebula Parallax**
- Update the visual position based on `player.pos` and a low parallax factor.

### Task 3: Particle Implementation
**Files:**
- Modify: `src/background.js`

**Step 1: Implement Particle Generation**
- Create a `particles` array.
- Loop 50-100 times to create `k.circle()` objects.
- Assign random colors: `[white, gold]`.
- Assign random initial positions, velocities, and sizes (tiny).
- Set `z(-90)`.

**Step 2: Implement Particle Twinkle and Drift**
- In `k.onUpdate`, update `particle.pos` by `particle.vel`.
- Implement wrap-around logic.
- Update `particle.opacity` using `0.5 + 0.5 * Math.sin(k.time() * freq)`.

**Step 3: Implement Particle Parallax**
- Update the visual position based on `player.pos` and a medium parallax factor.

### Task 4: Performance & Polish
**Files:**
- Modify: `src/background.js`

**Step 1: Parallax Clamping**
- Ensure parallax offsets don't push objects too far off-screen during extreme player movement.

**Step 2: Color Blending**
- Adjust nebula opacities and colors to ensure a "cloudy" feel when overlapping.

---

## Verification Strategy

### 1. Visual Verification
- **Depth Test:** Move the player. Verify that particles move faster than nebulae, and both move slower than the player.
- **Wrap Test:** Wait for a nebula to drift off-screen and verify it reappears on the opposite side smoothly.
- **Twinkle Test:** Verify particles are pulsing in opacity.

### 2. Performance Verification
- **FPS Check:** Open browser console and verify the game maintains ~60FPS with 100+ particles.
- **Memory Check:** Ensure no new objects are created in the `onUpdate` loop (use the pre-allocated pools).

### 3. Integration Verification
- Verify that `main.js` no longer loads the external background image.
- Verify that game objects (narrative/environment) are still rendered on top of the background.

---

## Execution Handoff

Use [executing-plans] mode to implement this plan task-by-task.
See [test-driven-development] for implementing the logic in `src/background.js`.
