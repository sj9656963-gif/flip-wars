// 효과음·배경음악: 소리 파일 없이 Web Audio로 합성. 뒤집힘처럼 잦은 소리는 초당 횟수를 제한함.

type Bus = 'sfx' | 'music';

export class Sfx {
  sfxOn = true;
  musicOn = true;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private timer = 0;
  private step = 0;
  private nextNote = 0;
  private fever = false;

  /** 첫 터치 때 호출해야 소리가 남 (브라우저 정책) */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.8;
      this.sfxBus.connect(master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.26;
      this.musicBus.connect(master);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  private ready(bus: Bus = 'sfx'): AudioContext | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    if (bus === 'sfx' && !this.sfxOn) return null;
    if (bus === 'music' && !this.musicOn) return null;
    return ctx;
  }

  /** 같은 소리를 gap초 안에 또 내지 않음 */
  private throttle(key: string, gap: number): boolean {
    const now = this.ctx?.currentTime ?? 0;
    if (now - (this.last[key] ?? -9) < gap) return false;
    this.last[key] = now;
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, o: { at?: number; to?: number; bus?: Bus } = {}): void {
    const ctx = this.ready(o.bus);
    if (!ctx) return;
    const t = o.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(o.bus === 'music' ? this.musicBus! : this.sfxBus!);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private noise(dur: number, vol: number, freq: number, o: { at?: number; to?: number; type?: BiquadFilterType; bus?: Bus } = {}): void {
    const ctx = this.ready(o.bus);
    if (!ctx || !this.noiseBuf) return;
    const t = o.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(o.bus === 'music' ? this.musicBus! : this.sfxBus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  pop(): void {
    if (!this.throttle('pop', 0.035)) return;
    const f = 520 + Math.random() * 480;
    this.tone(f, 0.07, 'sine', 0.09, { to: f * 1.6 });
  }

  shot(): void {
    if (!this.throttle('shot', 0.1)) return;
    this.noise(0.05, 0.05, 1500);
    this.tone(140, 0.06, 'sine', 0.06, { to: 80 });
  }

  gate(): void {
    if (!this.throttle('gate', 0.12)) return;
    const t = this.ctx?.currentTime ?? 0;
    this.tone(880, 0.08, 'triangle', 0.11, { at: t });
    this.tone(1320, 0.12, 'triangle', 0.1, { at: t + 0.06 });
  }

  coin(): void {
    const t = this.ctx?.currentTime ?? 0;
    this.tone(1318, 0.09, 'triangle', 0.14, { at: t });
    this.tone(1976, 0.16, 'triangle', 0.12, { at: t + 0.07 });
  }

  card(): void {
    this.tone(520, 0.14, 'triangle', 0.16, { to: 820 });
  }

  nope(): void {
    this.tone(190, 0.13, 'square', 0.05, { to: 150 });
  }

  click(): void {
    this.tone(720, 0.05, 'triangle', 0.1);
  }

  boom(): void {
    this.noise(0.75, 0.45, 1800, { to: 110 });
    this.tone(75, 0.5, 'sine', 0.35, { to: 38 });
  }

  hit(): void {
    if (!this.throttle('hit', 0.14)) return;
    this.tone(170, 0.12, 'square', 0.05, { to: 110 });
  }

  alarm(): void {
    const t = this.ctx?.currentTime ?? 0;
    this.tone(880, 0.1, 'square', 0.05, { at: t });
    this.tone(660, 0.12, 'square', 0.05, { at: t + 0.13 });
  }

  freeze(): void {
    const t = this.ctx?.currentTime ?? 0;
    [1568, 1976, 2349, 2637].forEach((f, k) => this.tone(f, 0.25, 'sine', 0.06, { at: t + k * 0.05 }));
  }

  count(n: number): void {
    if (n > 0) this.tone(660, 0.16, 'triangle', 0.18);
    else this.tone(990, 0.35, 'triangle', 0.2, { to: 1320 });
  }

  fanfare(win: boolean): void {
    const t = this.ctx?.currentTime ?? 0;
    const notes = win ? [523, 659, 784, 1046, 1318] : [440, 392, 330, 262];
    notes.forEach((f, k) => this.tone(f, win ? 0.28 : 0.4, 'triangle', 0.16, { at: t + k * (win ? 0.11 : 0.18) }));
  }

  feverStart(): void {
    const t = this.ctx?.currentTime ?? 0;
    [523, 659, 784, 1046].forEach((f, k) => this.tone(f, 0.16, 'square', 0.05, { at: t + k * 0.07 }));
  }

  // ───────────────────────── 배경음악 (짧은 반복 곡) ─────────────────────────

  startMusic(): void {
    if (!this.ctx || this.timer) return;
    this.nextNote = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 30);
  }

  stopMusic(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.fever = false;
  }

  setFever(on: boolean): void {
    this.fever = on;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNote < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextNote);
      this.nextNote += 60 / (this.fever ? 140 : 118) / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(s: number, t: number): void {
    if (!this.ready('music')) return;
    const bar = s >> 4;
    const pos = s & 15;
    const roots = [45, 41, 48, 43];
    const minor = [true, false, false, false];
    const root = roots[bar];
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    if (pos % 4 === 0) this.tone(150, 0.16, 'sine', 0.55, { at: t, to: 45, bus: 'music' });
    if (pos % 4 === 2) this.noise(0.03, 0.12, 7000, { at: t, type: 'highpass', bus: 'music' });
    if (pos === 0 || pos === 3 || pos === 6 || pos === 8 || pos === 11 || pos === 14) this.tone(hz(root), 0.2, 'triangle', 0.26, { at: t, bus: 'music' });
    if (pos % 2 === 0 || this.fever) {
      const chord = [0, minor[bar] ? 3 : 4, 7, 12];
      const note = root + 24 + chord[(s >> (this.fever ? 0 : 1)) % 4];
      this.tone(hz(note), 0.12, 'square', this.fever ? 0.05 : 0.035, { at: t, bus: 'music' });
    }
  }
}
