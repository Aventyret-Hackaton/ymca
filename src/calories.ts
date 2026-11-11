import type { Feature } from "./classify";

/**
 * A rough, for-fun estimate of the energy spent writing a message. It uses
 * the standard formula kcal/min = MET × 3.5 × body weight (kg) / 200, where
 * MET is the intensity of the activity. The intensity is guessed from how
 * fast the body points move. It is not a measurement.
 */

/** Assumed body weight; the app does not know the real one. */
const BODY_WEIGHT_KG = 70;
/** Standing still and holding a pose. */
const BASE_MET = 2;
/** Added on top of the base at full movement, roughly vigorous gymnastics in total. */
const MAX_EXTRA_MET = 4;
/** Extra MET per unit of speed (torso lengths per second, averaged over the body). */
const MET_PER_SPEED = 3;
/** Speed below this is treated as jitter in the pose detection, not movement. */
const NOISE_SPEED = 0.3;
/**
 * Movement is measured between poses at least this far apart, so the speed
 * (and how much jitter adds to it) does not depend on the frame rate.
 */
const SAMPLE_MS = 100;
/** Gaps longer than this (paused, tab hidden) are not counted. */
const MAX_GAP_MS = 1000;
/** Time for the speed estimate to follow about two thirds of a change. */
const SMOOTHING_MS = 150;
const MIN_VISIBILITY = 0.5;

export class CalorieCounter {
  kcal = 0;
  private last: Feature | null = null;
  private lastAt = 0;
  private speed = 0;

  /** Call every frame while the message is being written. */
  update(feature: Feature | null, now: number): void {
    // Nobody in the picture: nothing to count.
    if (!feature) return this.pause();
    const gap = now - this.lastAt;
    // Wait for a longer step; the time is counted when it comes.
    if (this.lastAt > 0 && gap < SAMPLE_MS) return;
    if (this.lastAt > 0 && gap <= MAX_GAP_MS) {
      const moved = this.last ? meanDistance(feature, this.last) : 0;
      const follow = 1 - Math.exp(-gap / SMOOTHING_MS);
      this.speed += follow * (moved / (gap / 1000) - this.speed);
      const extra = Math.min(MAX_EXTRA_MET, Math.max(0, this.speed - NOISE_SPEED) * MET_PER_SPEED);
      const kcalPerMinute = ((BASE_MET + extra) * 3.5 * BODY_WEIGHT_KG) / 200;
      this.kcal += kcalPerMinute * (gap / 60_000);
    }
    this.last = feature;
    this.lastAt = now;
  }

  /** Call when writing stops, so the pause itself is not counted. */
  pause(): void {
    this.last = null;
    this.lastAt = 0;
    this.speed = 0;
  }

  /** Call when a new message begins. */
  reset(): void {
    this.pause();
    this.kcal = 0;
  }

  /** "3,2" – one decimal, Swedish decimal comma. */
  format(): string {
    return this.kcal.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
}

/** Average distance between the same body points in two poses, ignoring hidden points. */
function meanDistance(a: Feature, b: Feature): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i][2] < MIN_VISIBILITY || b[i][2] < MIN_VISIBILITY) continue;
    total += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
    count++;
  }
  return count > 0 ? total / count : 0;
}
