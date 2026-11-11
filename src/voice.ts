/**
 * Voice commands through the browser's built-in speech recognition
 * (Web Speech API). Supported in Chrome and Safari, not in Firefox. Note that
 * these browsers send the audio to Google/Apple to turn it into text.
 */

export type VoiceCommand = "start" | "stop" | "clear" | "send" | "undo";

const COMMAND_WORDS: Record<VoiceCommand, string[]> = {
  start: ["starta", "start", "börja"],
  stop: ["stopp", "stoppa", "stop", "pausa", "sluta"],
  clear: ["rensa"],
  send: ["skicka"],
  undo: ["ångra"],
};

/** The same command is not fired again within this time (interim results repeat it). */
const COOLDOWN_MS = 2000;
const RESTART_DELAY_MS = 300;

// The Web Speech API is not in TypeScript's DOM types; this is the part we use.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
type RecognitionConstructor = new () => Recognition;

function getConstructor(): RecognitionConstructor | undefined {
  const w = window as unknown as Record<string, RecognitionConstructor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isVoiceSupported(): boolean {
  return getConstructor() !== undefined;
}

export function findCommand(transcript: string): VoiceCommand | null {
  const words = transcript.toLowerCase().split(/[^a-zåäö]+/);
  for (const command of Object.keys(COMMAND_WORDS) as VoiceCommand[]) {
    if (COMMAND_WORDS[command].some((word) => words.includes(word))) return command;
  }
  return null;
}

/**
 * Listens until the page is closed. Browsers end a recognition session after
 * a while (iOS after every phrase), so it is restarted whenever it ends.
 * `onBlocked` is called if the microphone is denied; listening then stops.
 */
export function listenForCommands(
  onCommand: (command: VoiceCommand) => void,
  onBlocked: (reason: string) => void,
): void {
  const Ctor = getConstructor();
  if (!Ctor) return onBlocked("unsupported");

  const recognition = new Ctor();
  recognition.lang = "sv-SE";
  recognition.continuous = true;
  recognition.interimResults = true;

  let blocked = false;
  let lastCommand: VoiceCommand | null = null;
  let lastCommandAt = 0;

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const command = findCommand(event.results[i][0].transcript);
      if (!command) continue;
      const now = performance.now();
      if (command === lastCommand && now - lastCommandAt < COOLDOWN_MS) continue;
      lastCommand = command;
      lastCommandAt = now;
      onCommand(command);
    }
  };

  recognition.onerror = (event) => {
    // "no-speech" and "aborted" are normal; only a denied microphone is fatal.
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      blocked = true;
      onBlocked(event.error);
    }
  };

  const start = () => {
    try {
      recognition.start();
    } catch {
      // Already running.
    }
  };
  recognition.onend = () => {
    if (!blocked) setTimeout(start, RESTART_DELAY_MS);
  };
  start();
}
