export function createBackground(k, player) {
    const W = k.width();
    const H = k.height();
    // Buffer must exceed (max radius + max parallax offset) so objects are
    // fully off-screen when they wrap, preventing visual popping.
    const BUFFER = 300;

    // --- Nebula Layer (Atmosphere) ---
    // Large, slow-moving, semi-transparent colored circles.
    const nebulaPalette = [
        [80, 20, 120],   // deep purple
        [0, 180, 200],   // cyan
        [200, 40, 160],  // magenta
    ];
    const NEBULA_COUNT = 5; // within plan range 4-6
    const nebulae = [];
    for (let i = 0; i < NEBULA_COUNT; i++) {
        const radius = 80 + Math.random() * 120; // large: 80-200
        const nebula = k.add([
            k.circle(radius),
            k.pos(Math.random() * W, Math.random() * H),
            k.color(nebulaPalette[i % nebulaPalette.length]),
            k.opacity(0.3),
            k.z(-100),
            {
                bgNebula: true,
                velX: (Math.random() - 0.5) * 10, // slow drift: -5..5 px/s
                velY: (Math.random() - 0.5) * 10,
                baseX: 0,
                baseY: 0,
            }
        ]);
        nebula.baseX = nebula.pos.x;
        nebula.baseY = nebula.pos.y;
        nebulae.push(nebula);
    }

    // --- Particle Layer (Dust) ---
    // Small, medium-speed, twinkling dots.
    const particlePalette = [
        [255, 255, 255], // white
        [255, 215, 0],   // gold
    ];
    const PARTICLE_COUNT = 75; // within plan range 50-100
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const radius = 1 + Math.random() * 2; // tiny: 1-3
        const particle = k.add([
            k.circle(radius),
            k.pos(Math.random() * W, Math.random() * H),
            k.color(particlePalette[i % particlePalette.length]),
            k.opacity(0.5),
            k.z(-90),
            {
                bgParticle: true,
                velX: (Math.random() - 0.5) * 20, // floating: -10..10 px/s
                velY: (Math.random() - 0.5) * 20,
                baseX: 0,
                baseY: 0,
                twinkleFreq: 2 + Math.random() * 2, // 2-4 Hz
            }
        ]);
        particle.baseX = particle.pos.x;
        particle.baseY = particle.pos.y;
        particles.push(particle);
    }

    // --- Parallax & Update Loop ---
    const NEBULA_PARALLAX = 0.1;   // slowest tier
    const PARTICLE_PARALLAX = 0.3; // medium tier
    const MAX_PARALLAX_OFFSET = 300; // clamp to prevent background detachment

    k.onUpdate(() => {
        const dt = k.dt();
        const px = player ? player.pos.x : 0;
        const py = player ? player.pos.y : 0;

        // Pre-compute clamped parallax offsets once per frame (no per-object alloc)
        const nox = clamp(px * NEBULA_PARALLAX);
        const noy = clamp(py * NEBULA_PARALLAX);
        const pox = clamp(px * PARTICLE_PARALLAX);
        const poy = clamp(py * PARTICLE_PARALLAX);

        // Nebulae: drift, wrap, parallax
        for (const nebula of nebulae) {
            nebula.baseX += nebula.velX * dt;
            nebula.baseY += nebula.velY * dt;
            wrapAxis(nebula, 'baseX', W, BUFFER);
            wrapAxis(nebula, 'baseY', H, BUFFER);
            nebula.pos.x = nebula.baseX + nox;
            nebula.pos.y = nebula.baseY + noy;
        }

        // Particles: drift, wrap, twinkle, parallax
        for (const particle of particles) {
            particle.baseX += particle.velX * dt;
            particle.baseY += particle.velY * dt;
            wrapAxis(particle, 'baseX', W, BUFFER);
            wrapAxis(particle, 'baseY', H, BUFFER);
            particle.opacity = 0.5 + 0.5 * Math.sin(k.time() * particle.twinkleFreq);
            particle.pos.x = particle.baseX + pox;
            particle.pos.y = particle.baseY + poy;
        }
    });

    function clamp(v) {
        return Math.max(-MAX_PARALLAX_OFFSET, Math.min(MAX_PARALLAX_OFFSET, v));
    }

    function wrapAxis(obj, axis, size, buffer) {
        if (obj[axis] > size + buffer) obj[axis] = -buffer;
        else if (obj[axis] < -buffer) obj[axis] = size + buffer;
    }

    return { nebulae, particles };
}
