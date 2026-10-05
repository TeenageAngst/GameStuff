# Ethereal Nebula & Particle Background Design

## Overview
Replace the static pulsing background image with a procedurally generated, multi-layered atmospheric system to enhance the "surreal" and "magical" aesthetic of the game.

## Architecture

### 1. Nebula Layer (Atmosphere)
- **Components:** 4-6 large, semi-transparent circles (`k.circle()`).
- **Visuals:** Palette of deep purples, cyans, and magentas.
- **Behavior:** 
    - Slow, random drift across the screen.
    - Wrap-around logic: When a nebula leaves the screen, it resets to the opposite side.
    - Slowest parallax tier.

### 2. Particle Layer (Dust)
- **Components:** 50-100 tiny glowing dots.
- **Visuals:** White/Gold colors with varying sizes.
- **Behavior:**
    - Floating motion.
    - Twinkling effect using `sin()` on opacity.
    - Medium parallax tier (moves faster than nebulae).

### 3. Rendering Order (Z-Index)
- **Nebulae:** `z(-100)`
- **Particles:** `z(-90)`
- **Game Objects:** `z(0)`

## Logic & Data Flow

### Initialization
- `createBackground(k)` function initializes two arrays: `nebulae` and `particles`.
- Each element is assigned random starting properties (position, velocity, size, color).

### Update Loop (`k.onUpdate`)
- **Drift:** `position += velocity`.
- **Wrap:** If `pos.x > width + buffer` then `pos.x = -buffer`.
- **Twinkle:** `opacity = 0.5 + 0.5 * Math.sin(k.time() * frequency)`.
- **Parallax:** `renderPos = actualPos + (playerPos * parallaxFactor)`.

## Error Handling & Testing

### Safeguards
- **Parallax Clamping:** Limit the maximum offset to prevent background detachment during fast movement.
- **Buffer Zones:** Use a buffer around screen edges for wrap-around to prevent visual popping.
- **Static Pool:** Use a fixed number of objects to avoid runtime allocation/GC spikes.

### Validation
- **Depth Test:** Verify 3-tier movement (Nebulae < Particles < Player).
- **Performance:** Ensure 60FPS with 100+ particles.
- **Visuals:** Confirm color blending of overlapping nebulae.
