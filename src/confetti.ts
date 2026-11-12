/**
 * Confetti drawn on the camera picture when a letter is confirmed. Sizes are
 * relative to the canvas, so it looks the same at any camera resolution.
 */

const COLORS = ["#7fd39a", "#ffd23f", "#ff6b6b", "#4dabf7", "#f783ac", "#ffffff"];
const PIECES_PER_BURST = 80;
const LIFETIME_MS = 2000;
/** Downward pull, in canvas heights per second squared. */
const GRAVITY = 1.2;

interface Piece {
  /** Position and velocity as fractions of the canvas size (per second). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  color: string;
  bornAt: number;
}

export class Confetti {
  private pieces: Piece[] = [];
  private lastDraw = 0;

  /** Throws a burst from (x, y), given as fractions of the canvas size. */
  burst(x: number, y: number, now: number): void {
    for (let i = 0; i < PIECES_PER_BURST; i++) {
      // Mostly upwards and outwards, so it rains down over the picture.
      const direction = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const speed = 0.4 + Math.random() * 0.7;
      this.pieces.push({
        x,
        y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 20,
        color: COLORS[i % COLORS.length],
        bornAt: now,
      });
    }
  }

  /** Moves and draws all pieces. Call once per frame, after the picture. */
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    // Capped so a frame after a pause does not throw pieces off screen.
    const dt = Math.min((now - this.lastDraw) / 1000, 0.05);
    this.lastDraw = now;
    this.pieces = this.pieces.filter((p) => now - p.bornAt < LIFETIME_MS && p.y < 1.1);
    if (this.pieces.length === 0) return;

    const { width, height } = ctx.canvas;
    const size = Math.min(width, height) * 0.02;
    ctx.save();
    for (const p of this.pieces) {
      p.vy += GRAVITY * dt;
      // A little air resistance so pieces flutter instead of falling like stones.
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      ctx.globalAlpha = Math.min(1, (LIFETIME_MS - (now - p.bornAt)) / 400);
      ctx.fillStyle = p.color;
      ctx.translate(p.x * width, p.y * height);
      ctx.rotate(p.angle);
      // Flattening by cos(angle) makes the rectangles look like they tumble.
      ctx.fillRect(-size / 2, -size / 4, size, (size / 2) * Math.cos(p.angle * 0.7));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
  }
}
