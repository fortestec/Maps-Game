import type { TransportMode } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private stepParity = 0;

  // Continuous vehicle engine synth nodes
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (!this.noiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.14);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.032));
      }
      this.noiseBuffer = buffer;
    }

    return this.ctx;
  }

  private ensureEngineNodes(ctx: AudioContext): void {
    if (this.engineOsc) return;

    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    subOsc.type = 'triangle';
    osc.frequency.value = 55;
    subOsc.frequency.value = 27.5;

    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 2.2;

    gain.gain.value = 0.0;

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    subOsc.start();

    this.engineOsc = osc;
    this.engineSubOsc = subOsc;
    this.engineFilter = filter;
    this.engineGain = gain;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public updateEngineAudio(
    mode: TransportMode,
    speedNorm: number, // 0..1
    isBoosting: boolean,
    active: boolean
  ): void {
    if (this.muted || !active || mode === 'walk') {
      if (this.engineGain && this.ctx) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      }
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;
    this.ensureEngineNodes(ctx);

    if (!this.engineOsc || !this.engineSubOsc || !this.engineFilter || !this.engineGain) return;

    const now = ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, speedNorm));

    if (mode === 'moto') {
      // Sporty higher-revving motorcycle tone
      this.engineOsc.type = 'sawtooth';
      const baseHz = 56 + clamped * (isBoosting ? 128 : 92);
      this.engineOsc.frequency.setTargetAtTime(baseHz, now, 0.08);
      this.engineSubOsc.frequency.setTargetAtTime(baseHz * 0.5, now, 0.08);
      this.engineFilter.frequency.setTargetAtTime(210 + clamped * 680, now, 0.08);
      this.engineGain.gain.setTargetAtTime(0.016 + clamped * 0.028, now, 0.08);
    } else {
      // Smooth warm car engine hum
      this.engineOsc.type = 'triangle';
      const baseHz = 44 + clamped * (isBoosting ? 88 : 62);
      this.engineOsc.frequency.setTargetAtTime(baseHz, now, 0.09);
      this.engineSubOsc.frequency.setTargetAtTime(baseHz * 0.5, now, 0.09);
      this.engineFilter.frequency.setTargetAtTime(160 + clamped * 420, now, 0.09);
      this.engineGain.gain.setTargetAtTime(0.018 + clamped * 0.024, now, 0.09);
    }
  }

  public playModeSwitch(mode: TransportMode): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (mode === 'walk') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.12);
    } else if (mode === 'moto') {
      // Quick throttle rev blip
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.11);
      osc.frequency.exponentialRampToValueAtTime(115, now + 0.24);
    } else {
      // Ignition starter thrum + chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(70, now);
      osc.frequency.exponentialRampToValueAtTime(135, now + 0.18);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  public playHorn(mode: TransportMode): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = mode === 'moto' ? [480] : mode === 'car' ? [370, 466] : [680];
    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = mode === 'walk' ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(f, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.065, now + 0.015);
      gain.gain.setValueAtTime(0.065, now + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  public playFootstep(isJogging: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    this.stepParity = (this.stepParity + 1) % 2;
    const pitchBias = this.stepParity === 0 ? 1.0 : 0.92;

    // 1. Sole thud
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    const startFreq = (isJogging ? 128 : 96) * pitchBias;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.075);

    const vol = isJogging ? 0.13 : 0.085;
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(vol, now + 0.008);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);

    // 2. Crisp pavement grit
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((isJogging ? 1500 : 1150) * pitchBias, now);
    filter.Q.setValueAtTime(1.6, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(isJogging ? 0.08 : 0.048, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
  }

  public playCameraToggle(toThirdPerson: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(toThirdPerson ? 360 : 540, now);
    osc.frequency.exponentialRampToValueAtTime(toThirdPerson ? 540 : 360, now + 0.09);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playTokenCollect(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.055;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playArrivalFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = [440, 554.37, 659.25, 880];

    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.68);
    });
  }

  public playPanoStep(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.045);

    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }
}

export const soundEngine = new SoundEngine();
