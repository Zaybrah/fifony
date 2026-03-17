import { useEffect, useRef } from "react";

/**
 * Radial burst of music notes exploding from the center of the screen.
 * Uses a pre-rendered sprite atlas for high performance — each symbol+color
 * combo is drawn once to an offscreen canvas, then blitted via drawImage.
 */
export default function OnboardingParticles() {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const SYMBOLS = ["\u266A", "\u266B", "\u2669", "\u266C"];
    const COLORS = [
      "oklch(0.75 0.18 250)",
      "oklch(0.80 0.16 200)",
      "oklch(0.70 0.20 330)",
      "oklch(0.85 0.14 85)",
      "oklch(0.75 0.18 145)",
      "oklch(0.80 0.12 280)",
      "oklch(0.78 0.15 30)",
    ];

    // ── Sprite atlas: pre-render every symbol+color at a fixed size ──
    const SPRITE_SIZE = 48; // px, largest we'll render
    const PAD = 4;
    const CELL = SPRITE_SIZE + PAD * 2;
    const cols = COLORS.length;
    const rows = SYMBOLS.length;
    const atlas = document.createElement("canvas");
    atlas.width = cols * CELL;
    atlas.height = rows * CELL;
    const actx = atlas.getContext("2d");
    actx.textAlign = "center";
    actx.textBaseline = "middle";
    actx.font = `${SPRITE_SIZE}px serif`;

    // spriteIndex[symbolIdx][colorIdx] = { x, y } in atlas
    const spriteIndex = [];
    for (let si = 0; si < rows; si++) {
      spriteIndex[si] = [];
      for (let ci = 0; ci < cols; ci++) {
        const sx = ci * CELL + CELL / 2;
        const sy = si * CELL + CELL / 2;
        actx.fillStyle = COLORS[ci];
        actx.fillText(SYMBOLS[si], sx, sy);
        spriteIndex[si][ci] = { x: ci * CELL, y: si * CELL };
      }
    }

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    function spawnParticle() {
      const cx = w / 2;
      const cy = h * 0.38;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 1.8 + 0.4;
      const spread = Math.random() * 20;
      const si = Math.floor(Math.random() * rows);
      const ci = Math.floor(Math.random() * cols);

      return {
        x: cx + Math.cos(angle) * spread,
        y: cy + Math.sin(angle) * spread,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.003 + Math.random() * 0.005,
        // scale relative to SPRITE_SIZE (0.25 to 0.65 of atlas sprite)
        scale: Math.random() * 0.4 + 0.25,
        si,
        ci,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.04,
        life: 0,
        maxLife: 180 + Math.random() * 200,
        fadeIn: 15,
      };
    }

    // Seed initial burst
    const initialCount = Math.min(Math.floor((w * h) / 6000), 120);
    particlesRef.current = [];
    for (let i = 0; i < initialCount; i++) {
      const p = spawnParticle();
      const advance = Math.random() * p.maxLife * 0.8;
      p.x += p.vx * advance;
      p.y += p.vy * advance + 0.5 * p.gravity * advance * advance;
      p.rotation += p.rotationSpeed * advance;
      p.life = advance;
      particlesRef.current.push(p);
    }

    const spawnRate = Math.max(1, Math.floor(initialCount / 90));
    let frameCount = 0;

    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      frameCount++;

      // Spawn new particles every other frame
      if (frameCount % 2 === 0) {
        for (let i = 0; i < spawnRate; i++) {
          particlesRef.current.push(spawnParticle());
        }
      }

      const alive = [];

      for (const p of particlesRef.current) {
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotationSpeed;
        p.vx *= 0.998;
        p.vy *= 0.998;

        if (p.life > p.maxLife) continue;
        if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) continue;

        alive.push(p);

        // Opacity: fade in, hold, fade out
        const fadeInAlpha = Math.min(1, p.life / p.fadeIn);
        const fadeOutStart = p.maxLife * 0.6;
        const fadeOutAlpha = p.life > fadeOutStart
          ? 1 - (p.life - fadeOutStart) / (p.maxLife - fadeOutStart)
          : 1;
        const alpha = fadeInAlpha * fadeOutAlpha * 0.45;

        if (alpha <= 0.01) continue;

        const sprite = spriteIndex[p.si][p.ci];
        const drawSize = CELL * p.scale;
        const half = drawSize / 2;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = alpha;
        ctx.drawImage(atlas, sprite.x, sprite.y, CELL, CELL, -half, -half, drawSize, drawSize);
        ctx.restore();
      }

      particlesRef.current = alive;
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
