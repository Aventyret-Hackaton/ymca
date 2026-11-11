import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

// Must match the installed @mediapipe/tasks-vision version.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
// "lite" is fastest on phones. Swap to pose_landmarker_full for better
// accuracy on floor/profile poses if the frame rate allows it.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export const CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;
export type Landmarks = NormalizedLandmark[];

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

/**
 * Starts the front camera. The picture is deliberately NOT mirrored: the
 * letters should read correctly for the camera/viewer, which means the
 * performer makes them mirrored from their own point of view.
 */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  await video.play();
}
