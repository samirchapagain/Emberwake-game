const MUTE_KEY = "emberwake.mute";

export class Sfx {
  muted = false;
  armed = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastHit = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  arm() {
    this.armed = true;
    this.ensure();
  }

  ensure() {
    if (!this.armed || this.muted) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.4);
      const noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noise = noise;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!this.muted) this.arm();
    return this.muted;
  }

  close() {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.noise = null;
    if (ctx) void ctx.close();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, gain: number, freq: number, q = 0.8) {
    if (!this.ctx || !this.master || !this.noise || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  slash(step: number) {
    this.ensure();
    const f = step === 2 ? 280 : 520 - step * 40;
    this.noiseBurst(step === 2 ? 0.16 : 0.09, step === 2 ? 0.28 : 0.16, f, 0.7);
    this.tone(step === 2 ? 180 : 340, 0.09, "sine", 0.05, 90);
  }

  hit(step: number) {
    const now = performance.now();
    if (now - this.lastHit < 42) return;
    this.lastHit = now;
    this.ensure();
    this.tone(step === 2 ? 140 : 210, 0.08, "square", 0.05, 70);
    this.noiseBurst(0.06, 0.18, step === 2 ? 420 : 900, 1.2);
  }

  kill() {
    this.ensure();
    this.tone(520, 0.07, "sine", 0.04, 220);
  }

  dash() {
    this.ensure();
    this.tone(240, 0.12, "sine", 0.05, 680);
    this.noiseBurst(0.1, 0.08, 1200, 0.5);
  }

  hurt() {
    this.ensure();
    this.tone(110, 0.2, "sawtooth", 0.06, 48);
    this.noiseBurst(0.16, 0.16, 180, 0.6);
  }

  novaCharge() {
    this.ensure();
    this.tone(180, 0.22, "sine", 0.06, 520);
  }

  nova() {
    this.ensure();
    this.tone(70, 0.45, "sine", 0.12, 40);
    this.noiseBurst(0.4, 0.32, 240, 0.4);
    this.tone(440, 0.18, "triangle", 0.04, 180);
  }

  pickup() {
    this.ensure();
    this.tone(660, 0.08, "sine", 0.05);
    this.tone(880, 0.1, "sine", 0.04);
  }

  wave() {
    this.ensure();
    [523, 659, 784].forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.12, "triangle", 0.04), i * 70);
    });
  }

  ready() {
    this.ensure();
    this.tone(740, 0.08, "sine", 0.04);
    this.tone(988, 0.12, "sine", 0.035);
  }

  phantom() {
    this.ensure();
    this.tone(880, 0.1, "sine", 0.045, 1320);
  }

  deny() {
    this.ensure();
    this.tone(140, 0.07, "square", 0.03, 90);
  }

  die() {
    this.ensure();
    this.tone(220, 0.45, "sawtooth", 0.07, 40);
    this.noiseBurst(0.35, 0.22, 300, 0.5);
  }

  ui() {
    this.ensure();
    this.tone(480, 0.05, "sine", 0.03);
  }
}
