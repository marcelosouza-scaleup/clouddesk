import { useState, useCallback } from "react";

const STORAGE_KEY = "clouddesk:notifications:enabled";

// ─── AudioContext beep (no external file needed) ──────────────────────────────

function playBeep(): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // AudioContext not supported — fail silently
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface NotifyOptions {
  title: string;
  body: string;
}

interface UseNotificationsReturn {
  isEnabled: boolean;
  toggle: () => void;
  notify: (options: NotifyOptions) => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setIsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable — ignore
      }
      return next;
    });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const notify = useCallback(
    (_options: NotifyOptions) => {
      if (!isEnabled) return;
      playBeep();
    },
    [isEnabled]
  );

  return { isEnabled, toggle, notify };
}
