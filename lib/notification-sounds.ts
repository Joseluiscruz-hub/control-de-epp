"use client";

export type NotificationSoundType =
  | "solped"
  | "critical"
  | "warning"
  | "budget"
  | "sync_error"
  | "success";

type ToneStep = {
  frequency: number;
  durationMs: number;
  delayMs?: number;
  gain?: number;
};

const SOUND_PATTERNS: Record<NotificationSoundType, ToneStep[]> = {
  solped: [
    { frequency: 740, durationMs: 120, gain: 0.045 },
    { frequency: 920, durationMs: 150, delayMs: 90, gain: 0.05 },
  ],
  critical: [
    { frequency: 880, durationMs: 120, gain: 0.055 },
    { frequency: 660, durationMs: 120, delayMs: 110, gain: 0.055 },
    { frequency: 880, durationMs: 150, delayMs: 220, gain: 0.055 },
  ],
  warning: [
    { frequency: 620, durationMs: 140, gain: 0.04 },
    { frequency: 760, durationMs: 140, delayMs: 120, gain: 0.04 },
  ],
  budget: [
    { frequency: 520, durationMs: 180, gain: 0.04 },
    { frequency: 690, durationMs: 180, delayMs: 160, gain: 0.04 },
  ],
  sync_error: [
    { frequency: 360, durationMs: 180, gain: 0.045 },
    { frequency: 280, durationMs: 220, delayMs: 160, gain: 0.045 },
  ],
  success: [
    { frequency: 660, durationMs: 100, gain: 0.035 },
    { frequency: 880, durationMs: 130, delayMs: 90, gain: 0.035 },
  ],
};

const lastPlayedAt = new Map<NotificationSoundType, number>();
let audioContext: AudioContext | null = null;
let hasUserInteraction = false;
let listenersInstalled = false;

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type UserActivationNavigator = Navigator & {
  userActivation?: {
    hasBeenActive?: boolean;
  };
};

export function notificationSoundPattern(type: NotificationSoundType) {
  return SOUND_PATTERNS[type];
}

function markUserInteraction() {
  hasUserInteraction = true;
}

function installInteractionListeners() {
  if (typeof window === "undefined" || listenersInstalled) return;
  listenersInstalled = true;
  window.addEventListener("pointerdown", markUserInteraction, { once: true, passive: true });
  window.addEventListener("keydown", markUserInteraction, { once: true });
  window.addEventListener("touchstart", markUserInteraction, { once: true, passive: true });
}

function canUseAudioAfterInteraction() {
  if (typeof navigator !== "undefined") {
    const activation = (navigator as UserActivationNavigator).userActivation;
    if (activation?.hasBeenActive) return true;
  }
  return hasUserInteraction;
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;

  const audioWindow = window as AudioWindow;
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return null;

  audioContext = new AudioContextCtor();
  return audioContext;
}

export function playNotificationSound(type: NotificationSoundType, options: { throttleMs?: number } = {}) {
  installInteractionListeners();
  if (!canUseAudioAfterInteraction()) return false;

  const throttleMs = options.throttleMs ?? 4_000;
  const now = Date.now();
  const lastPlayed = lastPlayedAt.get(type) ?? 0;
  if (now - lastPlayed < throttleMs) return false;

  const context = getAudioContext();
  if (!context) return false;

  try {
    if (context.state === "suspended") {
      void context.resume();
    }

    const startAt = context.currentTime + 0.02;
    for (const step of SOUND_PATTERNS[type]) {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const stepStart = startAt + ((step.delayMs ?? 0) / 1000);
      const stepEnd = stepStart + (step.durationMs / 1000);
      const gain = step.gain ?? 0.04;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(step.frequency, stepStart);
      gainNode.gain.setValueAtTime(0.0001, stepStart);
      gainNode.gain.exponentialRampToValueAtTime(gain, stepStart + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, stepEnd);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(stepStart);
      oscillator.stop(stepEnd + 0.02);
    }

    lastPlayedAt.set(type, now);
    return true;
  } catch (error) {
    console.warn("[notification sound failed]", error);
    return false;
  }
}

installInteractionListeners();
