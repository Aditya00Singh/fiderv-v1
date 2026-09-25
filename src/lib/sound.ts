/**
 * Web Audio API Sound Utility
 * Generates subtle, non-intrusive browser-native audio beeps for transfer lifecycle events.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Check localStorage for audio preference if available
    try {
      const stored = localStorage.getItem('fiederv_sound_muted');
      if (stored !== null) {
        this.isMuted = stored === 'true';
      }
    } catch (e) {
      // ignore
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      localStorage.setItem('fiederv_sound_muted', String(muted));
    } catch (e) {
      // ignore
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Subtle ascending two-tone beep when a transfer begins.
   */
  public playStart() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Note 1: 520 Hz
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(520, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.08, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.13);

      // Note 2: 740 Hz
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(740, now + 0.08);
      gain2.gain.setValueAtTime(0, now + 0.08);
      gain2.gain.linearRampToValueAtTime(0.08, now + 0.10);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.23);
    } catch (e) {
      // Audio playback failed or blocked by autoplay policy
    }
  }

  /**
   * Pleasant harmonic chord chime when a transfer completes successfully.
   */
  public playComplete() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Arpeggiated C-Major triad: C5 (523.25), E5 (659.25), G5 (783.99)
      const freqs = [523.25, 659.25, 783.99];

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.07;
        const duration = 0.35;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.09, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
      });
    } catch (e) {
      // Audio playback failed
    }
  }

  /**
   * Soft low cautionary tone when a transfer encounters an error or network drop.
   */
  public playError() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Note 1: 340 Hz
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(340, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.1, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.17);

      // Note 2: 240 Hz
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(240, now + 0.12);
      gain2.gain.setValueAtTime(0, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.1, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.33);
    } catch (e) {
      // Audio playback failed
    }
  }
}

export const sound = new SoundManager();
