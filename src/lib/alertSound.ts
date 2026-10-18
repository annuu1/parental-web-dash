/**
 * Web Audio API based High-Priority Geofence Emergency Alert Synthesizer
 * Produces loud, penetrating dual-tone siren/chime pulses with zero external assets needed.
 */

let cachedAudioCtx: AudioContext | null = null;
let hasAttachedInteractionListeners = false;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!cachedAudioCtx) {
    const AudioCtxClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      cachedAudioCtx = new AudioCtxClass();
    }
  }
  return cachedAudioCtx;
}

/**
 * Resumes audio context on first user click/touch to comply with browser autoplay policies.
 */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch (err) {
    console.warn('Could not resume AudioContext:', err);
    return false;
  }
}

/**
 * Sets up global interaction listeners to unlock Web Audio on first click or touch.
 */
export function setupAudioUnlockListeners() {
  if (typeof window === 'undefined' || hasAttachedInteractionListeners) return;
  hasAttachedInteractionListeners = true;

  const onInteract = () => {
    unlockAudio();
    ['click', 'touchstart', 'keydown'].forEach((evt) => {
      window.removeEventListener(evt, onInteract);
    });
  };

  ['click', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, onInteract, { passive: true, once: true });
  });
}

export interface ActiveAlertSound {
  stop: () => void;
  isPlaying: () => boolean;
}

/**
 * Synthesizes a loud, piercing, multi-frequency geofence emergency chime / siren pattern.
 * Repeated bursts: 920Hz -> 1320Hz -> 1760Hz -> 2100Hz with sawtooth + sine harmonic richness.
 */
export function playGeofenceAlertSound(options?: {
  loops?: number; // default: 4 bursts (~3.6 seconds)
  volume?: number; // default: 0.9 (loud)
}): ActiveAlertSound {
  const ctx = getAudioContext();
  let playing = true;
  const activeNodes: (OscillatorNode | GainNode)[] = [];
  const timeouts: NodeJS.Timeout[] = [];

  const stop = () => {
    playing = false;
    timeouts.forEach((t) => clearTimeout(t));
    activeNodes.forEach((node) => {
      try {
        if ('stop' in node) {
          (node as OscillatorNode).stop();
        }
        node.disconnect();
      } catch {
        // ignore already stopped nodes
      }
    });
    activeNodes.length = 0;
  };

  if (!ctx) {
    return { stop, isPlaying: () => false };
  }

  // Attempt to resume if suspended
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const volume = options?.volume ?? 0.92;
  const totalLoops = options?.loops ?? 4;

  const playTone = (
    freq: number,
    startTime: number,
    duration: number,
    waveType: OscillatorType = 'sawtooth'
  ) => {
    if (!playing) return;
    try {
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = waveType;
      osc.frequency.setValueAtTime(freq, startTime);

      // Sub-oscillator: sine wave for body and penetration
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq, startTime);

      // Crisp attack and decay envelope (avoids speaker pops)
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
      gainNode.gain.setValueAtTime(volume, startTime + duration - 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gainNode);
      subOsc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(startTime);
      subOsc.start(startTime);
      osc.stop(startTime + duration);
      subOsc.stop(startTime + duration);

      activeNodes.push(osc, subOsc, gainNode);
    } catch (e) {
      console.warn('Audio synthesis node error:', e);
    }
  };

  const patternDuration = 0.9; // seconds per cycle

  for (let loop = 0; loop < totalLoops; loop++) {
    const loopOffset = loop * patternDuration;
    const baseTime = ctx.currentTime + loopOffset + 0.05;

    // 4 piercing tone bursts per sequence
    playTone(920, baseTime, 0.12, 'sawtooth');
    playTone(1320, baseTime + 0.14, 0.12, 'sawtooth');
    playTone(1760, baseTime + 0.28, 0.14, 'square');
    playTone(2100, baseTime + 0.44, 0.22, 'square');
  }

  const totalTimeMs = (totalLoops * patternDuration + 0.3) * 1000;
  const finishTimeout = setTimeout(() => {
    playing = false;
  }, totalTimeMs);
  timeouts.push(finishTimeout);

  return { stop, isPlaying: () => playing };
}

/**
 * Checks if sound alert is enabled in user settings / local storage.
 */
export function isAlertSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem('geofence_alert_sound_enabled');
    return val !== 'false';
  } catch {
    return true;
  }
}

/**
 * Sets sound alert enabled/disabled preference in local storage.
 */
export function setAlertSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('geofence_alert_sound_enabled', enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

/**
 * Dispatches a native browser desktop notification if supported and granted.
 */
export function sendDesktopNotification(event: {
  geofenceName: string;
  deviceName?: string;
  eventType: 'ENTER' | 'EXIT';
  distanceFromCenter?: number;
}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const isEnter = event.eventType === 'ENTER';
  const title = `${isEnter ? '🟢 Entered' : '🚨 Exited'}: ${event.geofenceName}`;
  const body = `${event.deviceName || 'Child Device'} has ${
    isEnter ? 'entered' : 'exited'
  } ${event.geofenceName}${
    event.distanceFromCenter ? ` (${event.distanceFromCenter}m from center)` : ''
  }.`;

  try {
    const notif = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: `geofence-${Date.now()}`,
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch (err) {
    console.warn('Desktop notification dispatch error:', err);
  }
}
