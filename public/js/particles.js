/* ═══════════════════════════════════════════════════════════════
   PARTICLE ANIMATION SYSTEM
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const canvas = document.getElementById("particle-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let particles = [];
  let animFrame;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resize();
  window.addEventListener("resize", () => {
    resize();
    initParticles();
  });

  // ─── Particle Class ───────────────────────────────────────────
  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.6;
      this.vy = (Math.random() - 0.5) * 0.6;
      this.size = Math.random() * 2 + 0.5;
      this.alpha = Math.random() * 0.6 + 0.1;
      this.alphaDecay = (Math.random() - 0.5) * 0.005;
      this.color = this._pickColor();
      this.twinkle = Math.random() * Math.PI * 2;
      this.twinkleSpeed = Math.random() * 0.04 + 0.01;
    }

    _pickColor() {
      const colors = [
        [0, 245, 255], // cyan (primary)
        [123, 47, 247], // purple (secondary)
        [168, 85, 247], // light purple
        [255, 0, 102], // accent pink
        [200, 230, 255], // soft white-blue
      ];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.twinkle += this.twinkleSpeed;
      this.alpha += Math.sin(this.twinkle) * 0.008;

      if (this.alpha <= 0 || this.alpha > 1) this.alphaDecay *= -1;
      this.alpha = Math.max(0.05, Math.min(0.8, this.alpha));

      // Wrap around edges
      if (this.x < -5) this.x = canvas.width + 5;
      if (this.x > canvas.width + 5) this.x = -5;
      if (this.y < -5) this.y = canvas.height + 5;
      if (this.y > canvas.height + 5) this.y = -5;
    }

    draw() {
      const [r, g, b] = this.color;
      ctx.save();
      ctx.globalAlpha = this.alpha;

      // Glow effect
      const gradient = ctx.createRadialGradient(
        this.x,
        this.y,
        0,
        this.x,
        this.y,
        this.size * 3,
      );
      gradient.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},0.3)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.fillStyle = `rgba(${r},${g},${b},1)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 0.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // ─── Shooting Stars ───────────────────────────────────────────
  class ShootingStar {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height * 0.5;
      this.vx = (Math.random() * 4 + 3) * (Math.random() > 0.5 ? 1 : -1);
      this.vy = Math.random() * 2 + 1;
      this.length = Math.random() * 80 + 40;
      this.alpha = 1;
      this.decay = Math.random() * 0.015 + 0.008;
      this.active = false;
      this.spawnDelay = Math.random() * 8000 + 2000;
      this.spawnTime = performance.now() + this.spawnDelay;
    }

    update(now) {
      if (!this.active && now >= this.spawnTime) {
        this.active = true;
      }
      if (!this.active) return;

      this.x += this.vx;
      this.y += this.vy;
      this.alpha -= this.decay;

      if (this.alpha <= 0) this.reset();
    }

    draw() {
      if (!this.active) return;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      const gradient = ctx.createLinearGradient(
        this.x,
        this.y,
        this.x - this.vx * 12,
        this.y - this.vy * 12,
      );
      gradient.addColorStop(0, "rgba(0, 245, 255, 1)");
      gradient.addColorStop(1, "rgba(0, 245, 255, 0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.vx * 12, this.y - this.vy * 12);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ─── Connection Lines ─────────────────────────────────────────
  function drawConnections() {
    const maxDist = 130;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.15;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = "rgba(0, 245, 255, 1)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // ─── Init ─────────────────────────────────────────────────────
  function initParticles() {
    const count = Math.min(
      Math.floor((canvas.width * canvas.height) / 12000),
      120,
    );
    particles = Array.from({ length: count }, () => new Particle());
  }

  const shootingStars = Array.from({ length: 5 }, () => new ShootingStar());

  function animate(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw connections
    drawConnections();

    // Update & draw particles
    particles.forEach(p => {
      p.update();
      p.draw();
    });

    // Shooting stars
    shootingStars.forEach(s => {
      s.update(now);
      s.draw();
    });

    animFrame = requestAnimationFrame(animate);
  }

  initParticles();
  animate(performance.now());

  // Cleanup
  window.addEventListener("beforeunload", () =>
    cancelAnimationFrame(animFrame),
  );
})();
