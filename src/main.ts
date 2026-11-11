import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import {
  averageFeatures,
  isConfident,
  nearest,
  toFeature,
  type Feature,
  type Match,
  type Template,
} from "./classify";
import { CalorieCounter } from "./calories";
import { CONNECTIONS, createPoseLandmarker, startCamera, type Landmarks } from "./pose";
import {
  BACKSPACE,
  LABELS,
  SEND,
  SPACE,
  exportTemplates,
  importTemplates,
  loadName,
  loadOwnTemplates,
  loadSharedTemplates,
  saveName,
  saveOwnTemplates,
  saveTemplatesToRepo,
  toFileName,
  type SharedTemplates,
} from "./templates";
import { openSms } from "./sms";
import { isVoiceSupported, listenForCommands, type VoiceCommand } from "./voice";

/** How long a pose must be held before it counts. */
const HOLD_MS = 1500;
/** Overlay colours on the camera picture, matching the sage theme in style.css. */
const OVERLAY_ACCENT = "#7fd39a";
const OVERLAY_BG = "rgba(31, 51, 40, 0.8)";
/** Time to walk away from the phone and get into position before recording. */
const RECORD_COUNTDOWN_MS = 5000;
/** How long a recording samples the pose. */
const RECORD_SAMPLE_MS = 1000;

/** Short button text for the control poses, whose names are too long for the grid. */
const LABEL_ICONS: Record<string, string> = { [SPACE]: "␣", [BACKSPACE]: "⌫", [SEND]: "✉" };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("stage");
const ctx = canvas.getContext("2d")!;
const messageEl = $("message");
const statusEl = $("status");
const smsLink = $<HTMLAnchorElement>("sms-link");

let landmarker: PoseLandmarker;
/** The person's file name in the repo: templates/<name>.json. Empty until they enter it. */
let name = loadName();
/** Templates recorded on this device. The only ones that can be changed here. */
let own: Template[] = [];
/** Everyone's committed templates, by file name. */
let shared: SharedTemplates = {};
/** What poses are matched against: own templates plus everyone else's. */
let templates: Template[] = [];

function othersTemplates(): Template[] {
  return Object.entries(shared)
    .filter(([person]) => person !== name)
    .flatMap(([, list]) => list);
}

/** Call after `own`, `shared` or `name` changes. */
function refreshTemplates(): void {
  templates = [...own, ...othersTemplates()];
  renderLabels();
}

function setOwnTemplates(next: Template[]): void {
  own = next;
  saveOwnTemplates(own);
  refreshTemplates();
}
let message = "";
/** Estimated energy spent on the current message. User mode only. */
const calories = new CalorieCounter();

/**
 * Setup mode (the settings page, ?setup in the address) is for the team:
 * poses are recorded there and nothing is written. Without it the app runs in
 * user mode, where recording is unavailable and writing is switched on by voice.
 */
const setupMode = new URLSearchParams(location.search).has("setup");
/** User mode only: whether poses are currently turned into text. */
let writing = false;
/** Set when voice control cannot work, e.g. the microphone was denied. */
let voiceProblem = "";
/** For troubleshooting on screen: whether the browser is listening, and what it last heard. */
let voiceListening = false;
let voiceHeard = "";
/**
 * Commands are ignored until this time, so the app does not hear its own
 * voice as a command. Kept as our own clock: Safari's speechSynthesis.speaking
 * can stay true after an utterance, which would block every command.
 */
let deafUntil = 0;
const OWN_VOICE_GUARD_MS = 700;
/** Rough speaking time, used until the utterance reports that it has ended. */
const SPEAK_MS_PER_CHARACTER = 90;

// Hold-to-confirm state.
let candidate: string | null = null;
let candidateSince = 0;
/** The label just confirmed; it cannot fire again until the pose is released. */
let locked: string | null = null;

// Recording state.
let selectedLabel = LABELS[0];
let recording: { label: string; startsAt: number; endsAt: number; samples: Feature[] } | null = null;

function speak(text: string): void {
  if (!text || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "sv-SE";
  deafUntil = performance.now() + text.length * SPEAK_MS_PER_CHARACTER + OWN_VOICE_GUARD_MS;
  utterance.onend = () => (deafUntil = performance.now() + OWN_VOICE_GUARD_MS);
  speechSynthesis.speak(utterance);
}

/** Plain-language explanation of a speech recognition error code. */
function describeVoiceError(code: string): string {
  switch (code) {
    case "not-allowed":
      return "Mikrofonen är blockerad. Tillåt mikrofonen för sidan och ladda om.";
    case "service-not-allowed":
      return "Taligenkänning är avstängd på enheten. Slå på Diktering (och Siri) i enhetens inställningar och ladda om.";
    case "language-not-supported":
      return "Taligenkänningen på den här enheten stöder inte svenska.";
    case "audio-capture":
      return "Hittar ingen mikrofon.";
    case "network":
      return "Taligenkänningen når inte nätet. Försöker igen.";
    case "unsupported":
      return "Den här webbläsaren saknar röststyrning. Använd Chrome eller Safari.";
    default:
      return `Röstfel: ${code}. Försöker igen.`;
  }
}

function startVoice(): void {
  listenForCommands({
    onCommand: handleVoiceCommand,
    onListening: () => {
      voiceListening = true;
      voiceProblem = "";
    },
    onHeard: (transcript) => (voiceHeard = transcript.trim()),
    onError: (code) => {
      voiceListening = false;
      voiceProblem = describeVoiceError(code);
    },
  });
}

const voiceNoteEl = $("voice-note");
let voiceNoteShown = "";

/**
 * Shows the state of voice control under the message: a problem, that it has
 * not started, or what was last heard. The ordinary status line is hidden in
 * the design, and without this a silent microphone looks like a working one.
 */
function renderVoiceNote(): void {
  let text = "";
  if (voiceProblem) text = voiceProblem;
  else if (!voiceListening) text = "Röstigenkänningen har inte startat än.";
  else if (voiceHeard && !writing) text = `Hörde senast: ”${voiceHeard}”`;
  if (text === voiceNoteShown) return;
  voiceNoteShown = text;
  voiceNoteEl.textContent = text;
  voiceNoteEl.hidden = text === "";
  voiceNoteEl.classList.toggle("problem", voiceProblem !== "");
}

/** How long a note stays in the status line before the live status returns. */
const NOTE_MS = 4000;
let noteUntil = 0;

/**
 * Shows a message in the status line of the settings page. The live status
 * is redrawn every frame and would otherwise overwrite it immediately.
 */
function statusNote(text: string): void {
  statusEl.textContent = text;
  noteUntil = performance.now() + NOTE_MS;
}

function renderMessage(): void {
  messageEl.textContent = message;
}

/**
 * Sends the message as an SMS by opening the phone's messaging app with the
 * text filled in. Choosing a recipient and pressing Send happens there.
 */
function sendMessage(): void {
  const text = message.trim();
  if (!text) {
    speak("Det finns inget att skicka");
    return;
  }
  speak("Öppnar meddelanden");
  openSms(text, smsLink);
}

function handleVoiceCommand(command: VoiceCommand): void {
  if (performance.now() < deafUntil) return;
  if (command === "start" && !writing) {
    writing = true;
    smsLink.hidden = true;
    speak("Skriv ditt meddelande");
  } else if (command === "stop" && writing) {
    writing = false;
    calories.pause();
    speak("Pausat");
  } else if (command === "clear") {
    message = "";
    calories.reset();
    renderMessage();
    speak("Rensat");
  } else if (command === "undo" && message) {
    message = message.slice(0, -1);
    renderMessage();
    speak("Ångrat");
  } else if (command === "send") {
    sendMessage();
    // A new message has to be started by voice again.
    writing = false;
  }
}

function confirm(label: string): void {
  if (label === SPACE) message += " ";
  else if (label === BACKSPACE) message = message.slice(0, -1);
  else if (label === SEND) {
    // Read before sending, in case sending ever clears the message.
    const sent = message.trim() !== "";
    const total = calories.format();
    sendMessage();
    if (sent) speak(`Det kostade ${total} kilokalorier`);
    // The next message is counted from zero.
    calories.reset();
    // A new message has to be started by voice again.
    writing = false;
  } else message += label;
  if (label !== SEND) speak(label.toLowerCase());
  navigator.vibrate?.(100);
  renderMessage();
}

/** Advances hold-to-confirm; returns progress 0–1 for the ring. */
function updateHold(label: string | null, now: number): number {
  if (label !== locked) locked = null;
  if (label !== candidate) {
    candidate = label;
    candidateSince = now;
  }
  if (!label || label === locked) return 0;
  const progress = (now - candidateSince) / HOLD_MS;
  if (progress >= 1) {
    confirm(label);
    locked = label;
    return 0;
  }
  return progress;
}

function updateRecording(feature: Feature | null, now: number): void {
  if (!recording) return;
  if (now < recording.startsAt) return;
  if (now < recording.endsAt) {
    if (feature) recording.samples.push(feature);
    return;
  }
  const { label, samples } = recording;
  recording = null;
  $<HTMLButtonElement>("record-btn").disabled = false;
  if (samples.length === 0) {
    statusNote("Ingen kropp syntes. Se till att hela kroppen är i bild och försök igen.");
    speak("Försök igen");
    return;
  }
  setOwnTemplates([...own, { label, points: averageFeatures(samples) }]);
  statusNote(`Sparade en mall för ${label}.`);
  speak("Sparad");
}

function drawSkeleton(landmarks: Landmarks): void {
  const { width, height } = canvas;
  ctx.lineWidth = Math.max(3, width / 200);
  ctx.strokeStyle = OVERLAY_ACCENT;
  ctx.lineCap = "round";
  for (const { start, end } of CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if ((a.visibility ?? 0) < 0.3 || (b.visibility ?? 0) < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
}

/** Big letter with a progress ring in the top-left corner of the picture. */
function drawBadge(text: string, progress: number): void {
  const r = Math.min(canvas.width, canvas.height) * 0.11;
  const cx = r * 1.4;
  const cy = r * 1.4;
  ctx.fillStyle = OVERLAY_BG;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OVERLAY_ACCENT;
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${text.length > 1 ? r * 0.36 : r * 1.2}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
}

/** Large text across the bottom of the picture, readable from a few metres away. */
function drawBanner(text: string): void {
  const height = canvas.height * 0.16;
  ctx.fillStyle = OVERLAY_BG;
  ctx.fillRect(0, canvas.height - height, canvas.width, height);
  ctx.fillStyle = OVERLAY_ACCENT;
  ctx.font = `700 ${Math.min(height * 0.5, canvas.width / (text.length * 0.62))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height - height / 2);
}

/** Calorie count in the top-right corner of the picture, readable from a distance. */
function drawCalories(): void {
  const text = `${calories.format()} kcal`;
  const size = Math.min(canvas.width, canvas.height) * 0.07;
  ctx.save();
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  const width = ctx.measureText(text).width + size;
  const x = canvas.width - width - size * 0.4;
  const y = size * 0.4;
  ctx.fillStyle = "rgba(17, 19, 24, 0.75)";
  ctx.beginPath();
  // roundRect is missing in Safari before 16; a plain box is fine there.
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, size * 1.6, size * 0.8);
  else ctx.rect(x, y, width, size * 1.6);
  ctx.fill();
  ctx.fillStyle = "#ffd23f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + size * 0.85);
  ctx.restore();
}

function describe(match: Match | null, confident: boolean): string {
  if (templates.length === 0) {
    return setupMode
      ? "Inga mallar än. Välj en bokstav nedan och spela in."
      : "Inga poser är inspelade än, så appen kan inte känna igen bokstäver.";
  }
  if (!setupMode) {
    if (!match) return "Jag ser dig inte riktigt – backa ett steg så att hela du syns.";
    return confident
      ? `Snyggt – ${match.label}! Håll kvar …`
      : "Hmm, vilken bokstav är det där? Gör posen lite tydligare.";
  }
  if (!match) return "Ingen kropp i bild.";
  const runnerUp = match.runnerUp
    ? `, näst närmast ${match.runnerUp.label} (${match.runnerUp.distance.toFixed(2)})`
    : "";
  return `${confident ? "Ser" : "Osäker, närmast"} ${match.label} (${match.distance.toFixed(2)})${runnerUp}`;
}

function frame(): void {
  requestAnimationFrame(frame);
  if (video.readyState < 2 || video.videoWidth === 0) return;
  if (canvas.width !== video.videoWidth) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const now = performance.now();
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const landmarks = landmarker.detectForVideo(video, now).landmarks[0] as Landmarks | undefined;
  const feature = landmarks ? toFeature(landmarks, canvas.width / canvas.height) : null;
  if (landmarks) drawSkeleton(landmarks);

  if (recording) {
    const secondsLeft = Math.ceil((recording.startsAt - now) / 1000);
    if (secondsLeft > 0) drawBadge(String(secondsLeft), 1 - (recording.startsAt - now) / RECORD_COUNTDOWN_MS);
    else drawBadge("●", (now - recording.startsAt) / RECORD_SAMPLE_MS);
    updateRecording(feature, now);
    return;
  }

  if (setupMode) {
    // The settings page only previews what the templates recognise.
    const match = feature ? nearest(feature, templates) : null;
    const confident = match !== null && isConfident(match);
    if (confident) drawBadge(match.label, 0);
    if (now >= noteUntil) statusEl.textContent = describe(match, confident);
    return;
  }

  renderVoiceNote();

  if (!writing) {
    if (calories.kcal > 0) drawCalories();
    updateHold(null, now);
    drawBanner(voiceProblem ? "Röststyrning saknas" : voiceListening ? "Säg STARTA" : "Startar röststyrning…");
    statusEl.textContent = voiceProblem || "Jag lyssnar! Säg ”starta” när du är redo att röra på dig.";
    return;
  }

  const match = feature ? nearest(feature, templates) : null;
  const confident = match !== null && isConfident(match);
  // Counted before the hold is updated: if this frame confirms the send pose,
  // the spoken total includes it.
  calories.update(feature, now);
  drawCalories();
  const progress = updateHold(confident ? match.label : null, now);
  if (confident) drawBadge(match.label, progress);
  statusEl.textContent = describe(match, confident);
}

function renderLabels(): void {
  const container = $("labels");
  const others = othersTemplates();
  const count = (list: Template[], label: string) => list.filter((t) => t.label === label).length;
  container.replaceChildren(
    ...LABELS.map((label) => {
      const button = document.createElement("button");
      button.className = label === selectedLabel ? "selected" : "";
      button.append(LABEL_ICONS[label] ?? label);
      const small = document.createElement("small");
      // Own templates + everyone else's.
      small.textContent = `${count(own, label)} + ${count(others, label)}`;
      button.append(small);
      button.title = `${label}: ${count(own, label)} egna, ${count(others, label)} från andra`;
      button.addEventListener("click", () => {
        selectedLabel = label;
        renderLabels();
      });
      return button;
    }),
  );
  $("record-btn").textContent = `Spela in ${selectedLabel}`;
  $("delete-btn").textContent = `Ta bort mina mallar för ${selectedLabel}`;
  // "Latest" is the last template recorded on this device, whatever its letter.
  const latest = own[own.length - 1];
  const undoBtn = $<HTMLButtonElement>("undo-btn");
  undoBtn.disabled = !latest;
  undoBtn.textContent = latest ? `Ta bort senaste (${LABEL_ICONS[latest.label] ?? latest.label})` : "Ta bort senaste";
}

function setUpControls(): void {
  $("record-btn").addEventListener("click", () => {
    const startsAt = performance.now() + RECORD_COUNTDOWN_MS;
    recording = { label: selectedLabel, startsAt, endsAt: startsAt + RECORD_SAMPLE_MS, samples: [] };
    $<HTMLButtonElement>("record-btn").disabled = true;
    statusEl.textContent = `Ställ dig i posen för ${selectedLabel}…`;
  });

  $("undo-btn").addEventListener("click", () => {
    const latest = own[own.length - 1];
    if (!latest || recording) return;
    setOwnTemplates(own.slice(0, -1));
    statusNote(`Tog bort den senaste mallen för ${latest.label}.`);
  });

  $("delete-btn").addEventListener("click", () => {
    setOwnTemplates(own.filter((t) => t.label !== selectedLabel));
  });

  const nameInput = $<HTMLInputElement>("name-input");
  nameInput.value = name;
  nameInput.addEventListener("change", () => {
    name = toFileName(nameInput.value);
    nameInput.value = name;
    saveName(name);
    // Nothing recorded on this device yet: start from this person's file in the repo.
    if (loadOwnTemplates() === null) own = shared[name] ?? [];
    refreshTemplates();
  });

  $("export-btn").addEventListener("click", () => exportTemplates(own, name));

  // Only the dev server can write to the repo; the built app has no such endpoint.
  if (import.meta.env.DEV) {
    const repoBtn = $<HTMLButtonElement>("repo-btn");
    repoBtn.hidden = false;
    repoBtn.addEventListener("click", async () => {
      if (!name) {
        statusNote("Fyll i ditt namn först. Det blir filnamnet i repot.");
        nameInput.focus();
        return;
      }
      repoBtn.disabled = true;
      try {
        await saveTemplatesToRepo(own, name);
        statusNote(`Sparade ${own.length} mallar till templates/${name}.json på datorn. Checka in filen.`);
      } catch (error) {
        statusNote(`Kunde inte spara till repot: ${(error as Error).message}`);
      }
      repoBtn.disabled = false;
    });
  }

  $<HTMLInputElement>("import-input").addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      setOwnTemplates(await importTemplates(file));
      statusNote(`Importerade ${own.length} mallar som dina egna.`);
    } catch (error) {
      statusNote(`Kunde inte importera: ${(error as Error).message}`);
    }
  });
}

$("start-btn").addEventListener("click", async () => {
  const startStatus = $("start-status");
  if (!setupMode && !isVoiceSupported()) {
    startStatus.textContent = "Den här webbläsaren saknar röststyrning. Använd Chrome eller Safari.";
    return;
  }
  $<HTMLButtonElement>("start-btn").disabled = true;
  // Both must happen directly in the tap, before anything is awaited: Safari
  // only unlocks speech output and speech recognition from a user gesture.
  speak("Startar");
  if (!setupMode) startVoice();
  try {
    startStatus.textContent = "Startar kameran…";
    await startCamera(video);
    startStatus.textContent = "Laddar kroppsmodellen…";
    [landmarker, shared] = await Promise.all([createPoseLandmarker(), loadSharedTemplates()]);
    own = loadOwnTemplates() ?? shared[name] ?? [];
  } catch (error) {
    startStatus.textContent = `Det gick inte att starta: ${(error as Error).message}`;
    $<HTMLButtonElement>("start-btn").disabled = false;
    return;
  }
  $("start").hidden = true;
  $("app").hidden = false;
  if (setupMode) setUpControls();
  // Both modes match against everyone's templates.
  refreshTemplates();
  renderMessage();
  requestAnimationFrame(frame);
});

// The start screen and controls differ between the two modes.
document.body.classList.toggle("setup", setupMode);
$("start-btn").textContent = setupMode ? "Starta kameran" : "Godkänn och starta";
