import type { Landmarks } from "./pose";

/** One body point: x, y in torso lengths relative to the hip centre, plus visibility 0–1. */
export type Point = [x: number, y: number, visibility: number];
export type Feature = Point[];

export interface Template {
  label: string;
  points: Feature;
}

export interface Match {
  label: string;
  distance: number;
  /** Distance to the closest template of a different label, if any. */
  runnerUp?: { label: string; distance: number };
}

// MediaPipe pose landmark indices that we compare. Face details, fingers and
// feet are left out: they add noise and do not help tell letters apart.
const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_HIP = 23;
const R_HIP = 24;
const USED = [NOSE, L_SHOULDER, R_SHOULDER, 13, 14, 15, 16, L_HIP, R_HIP, 25, 26, 27, 28];

// Tuning knobs. Distances are in torso lengths (shoulder centre to hip centre).
/** A pose further than this from every template is "no letter". */
export const MAX_DISTANCE = 0.2;
/** The best letter must beat the second-best letter by this factor. */
export const MIN_MARGIN = 1.15;
/** Points less visible than this get almost no say. */
const MIN_WEIGHT = 0.05;
/**
 * Share of a template's visible body that must also be visible live. Without
 * it, a pose told apart mainly by the legs (like B) matches anyone standing
 * still with the legs out of frame, since hidden points get almost no say.
 */
export const MIN_COVERAGE = 0.8;

/**
 * Makes a pose comparable regardless of where the person stands and how big
 * they are in the picture: origin at the hip centre, scaled by torso length.
 * Returns null when the torso is not visible enough to do that.
 */
export function toFeature(landmarks: Landmarks, aspect: number): Feature | null {
  // Landmarks are 0–1 in both directions; multiply x by the aspect ratio so
  // that a unit means the same distance horizontally and vertically.
  const px = (i: number) => landmarks[i].x * aspect;
  const py = (i: number) => landmarks[i].y;

  const hipX = (px(L_HIP) + px(R_HIP)) / 2;
  const hipY = (py(L_HIP) + py(R_HIP)) / 2;
  const shoulderX = (px(L_SHOULDER) + px(R_SHOULDER)) / 2;
  const shoulderY = (py(L_SHOULDER) + py(R_SHOULDER)) / 2;
  const torso = Math.hypot(shoulderX - hipX, shoulderY - hipY);
  if (torso < 0.02) return null;

  return USED.map((i) => [(px(i) - hipX) / torso, (py(i) - hipY) / torso, landmarks[i].visibility ?? 0]);
}

/** Averages several features of the same pose into one, to smooth out jitter. */
export function averageFeatures(features: Feature[]): Feature {
  return features[0].map((_, i) => {
    const sum: Point = [0, 0, 0];
    for (const f of features) {
      sum[0] += f[i][0];
      sum[1] += f[i][1];
      sum[2] += f[i][2];
    }
    return [sum[0] / features.length, sum[1] / features.length, sum[2] / features.length];
  });
}

/**
 * Mean point-to-point distance from a live pose to a template, where points
 * hidden in either pose count less. Infinity when too much of what the
 * template shows is hidden live (see MIN_COVERAGE).
 */
function distance(live: Feature, template: Feature): number {
  let total = 0;
  let weights = 0;
  let templateWeights = 0;
  for (let i = 0; i < live.length; i++) {
    const w = Math.max(MIN_WEIGHT, Math.min(live[i][2], template[i][2]));
    total += w * Math.hypot(live[i][0] - template[i][0], live[i][1] - template[i][1]);
    weights += w;
    templateWeights += Math.max(MIN_WEIGHT, template[i][2]);
  }
  if (weights / templateWeights < MIN_COVERAGE) return Infinity;
  return total / weights;
}

/** Finds the closest label and the closest competing label, without judging them. */
export function nearest(feature: Feature, templates: Template[]): Match | null {
  const bestPerLabel = new Map<string, number>();
  for (const t of templates) {
    const d = distance(feature, t.points);
    if (d < (bestPerLabel.get(t.label) ?? Infinity)) bestPerLabel.set(t.label, d);
  }
  const ranked = [...bestPerLabel].filter(([, d]) => d < Infinity).sort((a, b) => a[1] - b[1]);
  // Empty when no templates exist or too little of the body is in view.
  if (ranked.length === 0) return null;
  return {
    label: ranked[0][0],
    distance: ranked[0][1],
    runnerUp: ranked[1] && { label: ranked[1][0], distance: ranked[1][1] },
  };
}

/** True when the match is close enough and clearly better than the runner-up. */
export function isConfident(match: Match): boolean {
  if (match.distance > MAX_DISTANCE) return false;
  if (match.runnerUp && match.runnerUp.distance < match.distance * MIN_MARGIN) return false;
  return true;
}
