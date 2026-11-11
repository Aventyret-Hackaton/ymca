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
  onstart: (() => void) | null;
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

export interface VoiceHandlers {
  onCommand(command: VoiceCommand): void;
  /** The browser has started listening (again). */
  onListening(): void;
  /** Everything the recogniser heard, command or not. Useful to see why a word is missed. */
  onHeard(transcript: string): void;
  /**
   * Something went wrong. `fatal` means listening has stopped for good, for
   * example because the microphone or the device's dictation is switched off.
   */
  onError(code: string, fatal: boolean): void;
}

/** Errors that will not go away by trying again. */
const FATAL_ERRORS = ["not-allowed", "service-not-allowed", "language-not-supported", "audio-capture"];
/** Errors that are part of normal operation and not worth reporting. */
const QUIET_ERRORS = ["no-speech", "aborted"];
const RETRY_DELAY_MS = 1000;

/**
 * Listens until the page is closed. Browsers end a recognition session after
 * a while (Safari after every phrase), so it is restarted whenever it ends.
 *
 * Call this directly from a tap or click: Safari may refuse to start speech
 * recognition, or to ask for the microphone, outside a user gesture.
 */
export function listenForCommands(handlers: VoiceHandlers): void {
  const Ctor = getConstructor();
  if (!Ctor) return handlers.onError("unsupported", true);

  const recognition = new Ctor();
  recognition.lang = "sv-SE";
  recognition.continuous = true;
  recognition.interimResults = true;

  let stopped = false;
  let running = false;
  let lastCommand: VoiceCommand | null = null;
  let lastCommandAt = 0;

  recognition.onstart = () => {
    running = true;
    handlers.onListening();
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      handlers.onHeard(transcript);
      const command = findCommand(transcript);
      if (!command) continue;
      const now = performance.now();
      if (command === lastCommand && now - lastCommandAt < COOLDOWN_MS) continue;
      lastCommand = command;
      lastCommandAt = now;
      handlers.onCommand(command);
    }
  };

  recognition.onerror = (event) => {
    if (QUIET_ERRORS.includes(event.error)) return;
    const fatal = FATAL_ERRORS.includes(event.error);
    if (fatal) stopped = true;
    handlers.onError(event.error, fatal);
  };

  const start = () => {
    if (stopped || running) return;
    try {
      recognition.start();
    } catch (error) {
      // Safari throws if the previous session has not fully ended yet. Report
      // it and try again, instead of going silent for good.
      handlers.onError(`start: ${(error as Error).message}`, false);
      setTimeout(start, RETRY_DELAY_MS);
    }
  };
  recognition.onend = () => {
    running = false;
    setTimeout(start, RESTART_DELAY_MS);
  };
  start();
}
