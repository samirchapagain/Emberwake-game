import { Sfx } from "./sfx";

export type Phase = "menu" | "playing" | "paused" | "dying" | "over";

export interface Hud {
  score: number;
  combo: number;
  mult: number;
  title: string;
  battle: number;
  hp: number;
  maxHp: number;
  heat: number;
  novaReady: boolean;
  dashPct: number;
  kills: number;
  time: number;
  bestCombo: number;
  low: boolean;
  hint: boolean;
}

export interface RunStats {
  score: number;
  battle: number;
  bestCombo: number;
  kills: number;
  time: number;
}

export interface EngineHooks {
  onPhase: (phase: Phase) => void;
  onHud: (hud: Hud) => void;
  onOver: (stats: RunStats) => void;
  onMute: (muted: boolean) => void;
}

type Kind = "cinder" | "hound" | "brute" | "wisp" | "elite";
type EState = "chase" | "windup" | "lunge" | "slam" | "recover";

interface Enemy {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  baseSpeed: number;
  hp: number;
  maxHp: number;
  damage: number;
  value: number;
  facing: number;
  state: EState;
  timer: number;
  cd: number;
  flash: number;
  spawn: number;
  seed: number;
  dead: boolean;
  hitScale: number;
  lungeAng: number;
  slamX: number;
  slamY: number;
  spdScale: number;
}

interface Bolt {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  dmg: number;
}

interface Gem {
  x: number;
  y: number;
  vy: number;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  grav: number;
  streak: boolean;
}

interface Floater {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
}

interface RingFx {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Ghost {
  x: number;
  y: number;
  facing: number;
  life: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  invuln: number;
  dashing: boolean;
  dashT: number;
  dashCd: number;
  dashAng: number;
  swinging: boolean;
  swingT: number;
  swingDur: number;
  swingStep: number;
  swingDir: number;
  swingFacing: number;
  chainStep: number;
  chainT: number;
  atkCd: number;
}

const STATS: Record<Kind, { hp: number; speed: number; radius: number; damage: number; value: number }> = {
  cinder: { hp: 2, speed: 108, radius: 13, damage: 8, value: 100 },
  hound: { hp: 6, speed: 86, radius: 16, damage: 12, value: 180 },
  wisp: { hp: 4, speed: 72, radius: 12, damage: 10, value: 160 },
  brute: { hp: 14, speed: 50, radius: 23, damage: 16, value: 320 },
  elite: { hp: 24, speed: 64, radius: 20, damage: 14, value: 640 },
};

const DASH_CD = 0.58;

export function comboMult(combo: number) {
  if (combo >= 30) return 5;
  if (combo >= 20) return 4;
  if (combo >= 12) return 3;
  if (combo >= 6) return 2;
  return 1;
}

export function comboTitle(combo: number) {
  if (combo >= 30) return "ECLIPSE";
  if (combo >= 20) return "INFERNO";
  if (combo >= 12) return "BLAZING";
  if (combo >= 6) return "KINDLED";
  return "";
}

export class Engine {
  readonly sfx = new Sfx();
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hooks: EngineHooks;
  private raf = 0;
  private alive = true;
  private ro: ResizeObserver | null = null;
  private last = 0;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private u = 1;
  private arena = { x: 0, y: 0, r: 120 };
  private sky: HTMLCanvasElement | null = null;
  private disc: HTMLCanvasElement | null = null;
  private discSize = 1;
  private phase: Phase = "menu";
  private reduce = false;
  private quality = 1;
  private anim = 0;
  private keys = new Set<string>();
  private attackHold = { key: false, mouse: false, touch: false, pad: false };
  private stick = { x: 0, y: 0, active: false };
  private moveX = 0;
  private moveY = 0;
  private padVec: { x: number; y: number } | null = null;
  private padDown = new Array<boolean>(16).fill(false);
  private mouseAim = false;
  private aim = { x: 0, y: 0 };
  private mouseX = 0;
  private mouseY = 0;
  private atkBuffer = 0;
  private dashBuffer = 0;
  private player: Player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: -Math.PI / 2,
    hp: 100,
    maxHp: 100,
    invuln: 0,
    dashing: false,
    dashT: 0,
    dashCd: 0,
    dashAng: 0,
    swinging: false,
    swingT: 0,
    swingDur: 0.14,
    swingStep: 0,
    swingDir: 1,
    swingFacing: -Math.PI / 2,
    chainStep: 0,
    chainT: 0,
    atkCd: 0,
  };
  private enemies: Enemy[] = [];
  private bolts: Bolt[] = [];
  private gems: Gem[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: RingFx[] = [];
  private ghosts: Ghost[] = [];
  private queue: Kind[] = [];
  private nextId = 1;
  private swingHit = new Set<number>();
  private dashHit = new Set<number>();
  private score = 0;
  private combo = 0;
  private comboT = 0;
  private comboRank = 0;
  private bestCombo = 0;
  private kills = 0;
  private runTime = 0;
  private battle = 0;
  private heat = 0;
  private novaAnnounced = false;
  private novaT = 0;
  private novaDur = 0.48;
  private novaHit = false;
  private novaR = 0;
  private novaResolving = false;
  private clearing = false;
  private clearT = 0;
  private spawnCd = 0.4;
  private bannerT = 0;
  private banner = "";
  private bannerSub = "";
  private showGuide = 0;
  private didSwing = false;
  private hitstop = 0;
  private trauma = 0;
  private punch = 0;
  private zoom = 1;
  private shakeX = 0;
  private shakeY = 0;
  private flash = 0;
  private hurtFlash = 0;
  private timeScale = 1;
  private scaleHold = 0;
  private deathT = 0;
  private reported = false;
  private ghostAcc = 0;
  private ambientAcc = 0;
  private hudKey = "";

  constructor(canvas: HTMLCanvasElement, hooks: EngineHooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas unsupported");
    this.ctx = ctx;
    this.reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.bind();
    this.resize();
    this.resetMenu();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get muted() {
    return this.sfx.muted;
  }

  play() {
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body) el.blur();
    this.sfx.arm();
    this.clearWorld();
    this.reported = false;
    this.phase = "playing";
    this.player.x = this.arena.x;
    this.player.y = this.arena.y;
    this.player.facing = -Math.PI / 2;
    this.player.hp = 100;
    this.player.maxHp = 100;
    this.mouseAim = false;
    this.didSwing = false;
    this.showGuide = 3.4;
    this.beginBattle(1);
    this.atkBuffer = 0.24;
    this.ring(this.arena.x, this.arena.y, 10, 280 * this.u, "#ffb15a");
    this.sfx.ready();
    this.hooks.onPhase("playing");
    this.emitHud(true);
  }

  pause() {
    if (this.phase !== "playing") return;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.sfx.ui();
    this.notify("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    this.sfx.ensure();
    this.notify("playing");
  }

  togglePause() {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused") this.resume();
  }

  toMenu() {
    this.keys.clear();
    this.attackHold = { key: false, mouse: false, touch: false, pad: false };
    this.stick = { x: 0, y: 0, active: false };
    this.resetMenu();
  }

  toggleMute() {
    const muted = this.sfx.toggle();
    this.hooks.onMute(muted);
    return muted;
  }

  setStick(x: number, y: number, active: boolean) {
    const m = Math.hypot(x, y);
    if (m > 1) {
      this.stick.x = x / m;
      this.stick.y = y / m;
    } else {
      this.stick.x = x;
      this.stick.y = y;
    }
    this.stick.active = active;
  }

  setAttackTouch(down: boolean) {
    this.attackHold.touch = down;
    if (down) this.atkBuffer = 0.16;
  }

  pressDash() {
    this.queueDash();
  }

  pressUlt() {
    this.tryUlt(true);
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onHide);
    this.sfx.close();
  }

  private notify(phase: Phase) {
    this.phase = phase;
    this.hooks.onPhase(phase);
  }

  private bind() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("contextmenu", this.onContext);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onHide);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
  }

  private onContext = (e: Event) => e.preventDefault();

  private onBlur = () => {
    this.keys.clear();
    this.attackHold.key = false;
    this.attackHold.mouse = false;
  };

  private onHide = () => {
    if (document.hidden && this.phase === "playing") this.pause();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.phase !== "playing") return;
    if (e.pointerType !== "touch") this.canvas.setPointerCapture(e.pointerId);
    const world = this.toWorld(e.clientX, e.clientY);
    if (e.pointerType === "touch") {
      this.player.facing = Math.atan2(world.y - this.player.y, world.x - this.player.x);
      this.mouseAim = false;
      this.atkBuffer = 0.16;
      return;
    }
    if (e.button === 0) {
      this.attackHold.mouse = true;
      this.atkBuffer = 0.16;
    } else if (e.button === 2) {
      e.preventDefault();
      this.queueDash();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.button === 0 || e.pointerType === "touch") this.attackHold.mouse = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.mouseX = ((e.clientX - rect.left) / rect.width) * this.w;
    this.mouseY = ((e.clientY - rect.top) / rect.height) * this.h;
    this.aim = this.toWorld(e.clientX, e.clientY);
    if (this.phase === "playing") this.mouseAim = true;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (target?.closest("button, a") && (e.code === "Space" || e.code === "Enter")) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "KeyM") {
      this.toggleMute();
      return;
    }
    if (this.phase === "menu" && (e.code === "Enter" || e.code === "Space")) {
      this.play();
      if (e.code === "Space") this.atkBuffer = 0.22;
      return;
    }
    if ((e.code === "Escape" || e.code === "KeyP") && (this.phase === "playing" || this.phase === "paused")) {
      this.togglePause();
      return;
    }
    if (e.code === "Escape" && (this.phase === "over" || this.phase === "dying")) {
      this.toMenu();
      return;
    }
    if (e.code === "KeyR" && (this.phase === "paused" || this.phase === "over" || this.phase === "dying")) {
      this.play();
      return;
    }
    if (e.code === "Enter" && this.phase === "paused") {
      this.resume();
      return;
    }
    if (this.phase !== "playing" && this.phase !== "menu") return;
    if (e.code === "Space" || e.code === "KeyJ" || e.code === "KeyZ") this.atkBuffer = 0.16;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyK" || e.code === "KeyX") this.queueDash();
    if (e.code === "KeyE" || e.code === "KeyF" || e.code === "KeyL") this.tryUlt(true);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private frame = (now: number) => {
    if (!this.alive) return;
    const real = Math.min(0.034, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.anim += real;
    if (this.phase !== "paused") {
      this.postFx(real);
      if (real > 0.022) this.quality = Math.max(0.45, this.quality - 0.05);
      else this.quality = Math.min(1, this.quality + 0.01);
    }
    this.pollInput();
    if (this.phase === "playing" || this.phase === "menu") {
      if (this.scaleHold > 0) this.scaleHold -= real;
      else this.timeScale += (1 - this.timeScale) * Math.min(1, real * 2.4);
      let sdt = real * this.timeScale;
      if (this.hitstop > 0) {
        this.hitstop = Math.max(0, this.hitstop - real);
        sdt = 0;
      }
      this.sim(sdt, real);
      this.ambient(sdt === 0 ? real * 0.25 : real);
    } else if (this.phase === "dying") {
      this.simDeath(real);
      this.ambient(real);
    }
    this.draw();
    this.emitHud();
    this.raf = requestAnimationFrame(this.frame);
  };

  private postFx(dt: number) {
    this.flash *= Math.exp(-12 * dt);
    this.hurtFlash *= Math.exp(-6 * dt);
    this.trauma *= Math.exp(-3.1 * dt);
    this.punch *= Math.exp(-7 * dt);
    if (this.trauma < 0.02) this.trauma = 0;
    if (this.punch < 0.002) this.punch = 0;
    this.zoom = 1 + (this.reduce ? this.punch * 0.2 : this.punch);
    const mag = this.trauma * (this.reduce ? 4 : 18);
    this.shakeX = (Math.random() - 0.5) * 2 * mag;
    this.shakeY = (Math.random() - 0.5) * 2 * mag;
  }

  private pollInput() {
    let x = 0;
    let y = 0;
    let key = false;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) {
      x -= 1;
      key = true;
    }
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) {
      x += 1;
      key = true;
    }
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) {
      y -= 1;
      key = true;
    }
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) {
      y += 1;
      key = true;
    }
    this.attackHold.key = this.keys.has("Space") || this.keys.has("KeyJ") || this.keys.has("KeyZ");
    this.readPad();
    if (this.stick.active) {
      this.moveX = this.stick.x;
      this.moveY = this.stick.y;
    } else if (key) {
      const m = Math.hypot(x, y) || 1;
      this.moveX = x / m;
      this.moveY = y / m;
    } else if (this.padVec) {
      this.moveX = this.padVec.x;
      this.moveY = this.padVec.y;
    } else {
      this.moveX = 0;
      this.moveY = 0;
    }
  }

  private readPad() {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    let pad: Gamepad | null = null;
    for (const candidate of pads) if (candidate) pad = candidate;
    if (!pad) {
      this.attackHold.pad = false;
      this.padVec = null;
      return;
    }
    const now = new Array<boolean>(16).fill(false);
    for (let i = 0; i < Math.min(16, pad.buttons.length); i++) now[i] = Boolean(pad.buttons[i]?.pressed);
    const edge = (i: number) => Boolean(now[i]) && !this.padDown[i];
    this.attackHold.pad = Boolean(now[0]);
    if (edge(1) || edge(7)) this.queueDash();
    if (edge(2) || edge(5)) this.tryUlt(false);
    if (edge(9)) {
      if (this.phase === "menu" || this.phase === "over" || this.phase === "dying") this.play();
      else this.togglePause();
    }
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const m = Math.hypot(ax, ay);
    this.padVec = m > 0.22 ? { x: ax / Math.max(1, m), y: ay / Math.max(1, m) } : null;
    this.padDown = now;
  }

  private runEnded() {
    return this.phase === "dying" || this.phase === "over";
  }

  private sim(sdt: number, realDt: number) {
    if (this.phase === "menu") this.driveBot();
    if (this.atkBuffer > 0) this.atkBuffer = Math.max(0, this.atkBuffer - realDt);
    if (this.dashBuffer > 0) this.dashBuffer = Math.max(0, this.dashBuffer - realDt);
    if (sdt > 0 && this.dashBuffer > 0) this.tryDash();
    if (this.showGuide > 0) this.showGuide = Math.max(0, this.showGuide - realDt);
    if (this.bannerT > 0) this.bannerT = Math.max(0, this.bannerT - realDt);
    if (sdt <= 0) {
      this.updateParticles(realDt * 0.35);
      this.updateFloaters(realDt);
      this.updateRings(realDt * 0.25);
      return;
    }
    this.updatePlayer(sdt);
    if (this.runEnded()) {
      this.prune();
      return;
    }
    this.updateEnemies(sdt);
    if (this.runEnded()) {
      this.prune();
      return;
    }
    this.updateBolts(sdt);
    if (this.runEnded()) {
      this.prune();
      return;
    }
    this.updateGems(sdt);
    this.updateNova(sdt);
    this.updateSpawn(sdt);
    if (this.phase === "playing") {
      this.runTime += sdt;
      if (this.combo > 0) {
        this.comboT -= sdt;
        if (this.comboT <= 0) {
          if (this.combo >= 6) this.floater(this.player.x, this.player.y - 32 * this.u, "BREAK", "#ff8a7a", 14);
          this.combo = 0;
          this.comboRank = 0;
        }
      }
      this.checkClear(sdt);
    }
    this.updateParticles(sdt);
    this.updateFloaters(realDt);
    this.updateRings(sdt);
    for (const ghost of this.ghosts) ghost.life -= sdt;
    this.prune();
  }

  private simDeath(dt: number) {
    this.deathT -= dt;
    this.updateParticles(dt);
    this.updateRings(dt);
    this.updateFloaters(dt);
    this.prune();
    if (this.deathT <= 0) {
      this.reportOver();
      this.notify("over");
    }
  }

  private driveBot() {
    let nearest: Enemy | null = null;
    let best = 1e9;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const d = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
      if (d < best) {
        best = d;
        nearest = enemy;
      }
    }
    if (!nearest) {
      this.moveX = Math.cos(this.anim * 0.6);
      this.moveY = Math.sin(this.anim * 0.45);
      return;
    }
    const ang = Math.atan2(nearest.y - this.player.y, nearest.x - this.player.x);
    const strafe = ang + Math.sin(this.anim * 1.6) * 0.55;
    const use = best > 52 * this.u ? ang : strafe;
    this.moveX = Math.cos(use);
    this.moveY = Math.sin(use);
    this.player.facing = ang;
    this.mouseAim = false;
    if (best < 72 * this.u) this.atkBuffer = 0.12;
    if (best < 42 * this.u && this.player.dashCd <= 0 && Math.sin(this.anim * 4.2) > 0.82) this.queueDash();
    if (this.heat >= 100 && this.enemies.length > 2 && this.novaT <= 0) this.tryUlt(false);
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    const radius = this.playerRadius();
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.atkCd = Math.max(0, p.atkCd - dt);
    if (!p.swinging) {
      p.chainT -= dt;
      if (p.chainT <= 0) p.chainStep = 0;
    }
    const want =
      this.attackHold.key || this.attackHold.mouse || this.attackHold.touch || this.attackHold.pad;
    if ((want || this.atkBuffer > 0) && !p.dashing && !p.swinging && p.atkCd <= 0) {
      this.startSwing();
      this.atkBuffer = 0;
    }
    if (p.dashing) {
      p.facing = p.dashAng;
      const steps = 3;
      const step = dt / steps;
      const spd = 740 * this.u;
      for (let i = 0; i < steps; i++) {
        p.x += Math.cos(p.dashAng) * spd * step;
        p.y += Math.sin(p.dashAng) * spd * step;
        this.shovePlayer();
        this.dashCollide();
      }
      if (this.ghostAcc <= 0) {
        this.ghosts.push({ x: p.x, y: p.y, facing: p.dashAng, life: 0.2 });
        this.ghostAcc = 0.02;
      } else this.ghostAcc -= dt;
      if (Math.random() < 0.8) {
        this.pushParticle({
          x: p.x - Math.cos(p.dashAng) * 10 * this.u,
          y: p.y - Math.sin(p.dashAng) * 10 * this.u,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30,
          life: 0.25,
          max: 0.25,
          size: 2.2 * this.u,
          color: "#ffb15a",
          drag: 3,
          grav: -10,
          streak: true,
        });
      }
      p.dashT -= dt;
      if (p.dashT <= 0) {
        p.dashing = false;
        this.burst(p.x, p.y, 6, "#ffd7a1");
      }
    } else {
      const mag = Math.hypot(this.moveX, this.moveY);
      if (mag > 0.12) {
        const nx = this.moveX / mag;
        const ny = this.moveY / mag;
        p.vx += nx * 2500 * this.u * dt;
        p.vy += ny * 2500 * this.u * dt;
        if (this.phase !== "menu" && !this.mouseAim && !p.swinging) p.facing = Math.atan2(ny, nx);
      }
      p.vx *= Math.exp(-13 * dt);
      p.vy *= Math.exp(-13 * dt);
      const max = 248 * this.u * (p.swinging ? 0.78 : 1);
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > max) {
        p.vx = (p.vx / sp) * max;
        p.vy = (p.vy / sp) * max;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.shovePlayer();
      if (sp > 40 * this.u && Math.random() < dt * 16) {
        this.pushParticle({
          x: p.x,
          y: p.y + radius * 0.6,
          vx: (Math.random() - 0.5) * 20,
          vy: -8,
          life: 0.28,
          max: 0.28,
          size: 1.6 * this.u,
          color: "#6d5848",
          drag: 2,
          grav: 0,
          streak: false,
        });
      }
    }
    if (this.phase === "playing" && this.mouseAim && !p.swinging && !p.dashing) {
      p.facing = Math.atan2(this.aim.y - p.y, this.aim.x - p.x);
    }
    if (p.swinging) {
      p.swingT += dt / p.swingDur;
      if (p.swingT >= 0.12 && p.swingT <= 0.78) this.applySwing();
      if (p.swingT >= 1) p.swinging = false;
    }
  }

  private startSwing() {
    const p = this.player;
    if (this.phase !== "playing" && this.phase !== "menu") return;
    const step = p.chainStep % 3;
    p.chainStep = step + 1;
    p.chainT = 0.72;
    p.swinging = true;
    p.swingT = 0;
    p.swingStep = step;
    p.swingDir = step === 1 ? -1 : 1;
    p.swingFacing = p.facing;
    p.swingDur = step === 2 ? 0.22 : 0.14;
    p.atkCd = step === 2 ? 0.26 : 0.045;
    this.swingHit.clear();
    this.didSwing = true;
    this.showGuide = 0;
    const stepIn = (step === 2 ? 14 : 9) * this.u;
    p.x += Math.cos(p.facing) * stepIn;
    p.y += Math.sin(p.facing) * stepIn;
    this.shovePlayer();
    this.sfx.slash(step);
    this.whoosh(step);
    if (step === 2) this.punch = Math.min(0.075, this.punch + 0.04);
  }

  private applySwing() {
    const p = this.player;
    const step = p.swingStep;
    const reach = (step === 2 ? 94 : 72) * this.u;
    const width = step === 2 ? 4.5 : 2.25;
    const dmg = (step === 2 ? 5 : 2) + (comboMult(this.combo) >= 3 ? 1 : 0);
    let hits = 0;
    let kills = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead || this.swingHit.has(enemy.id)) continue;
      if (!this.hitsArc(enemy.x, enemy.y, this.er(enemy), reach, width)) continue;
      this.swingHit.add(enemy.id);
      hits += 1;
      if (this.strikeEnemy(enemy, dmg)) kills += 1;
    }
    for (const bolt of this.bolts) {
      if (bolt.life <= 0 || this.swingHit.has(bolt.id)) continue;
      if (!this.hitsArc(bolt.x, bolt.y, bolt.r, reach, width)) continue;
      this.swingHit.add(bolt.id);
      bolt.life = 0;
      hits += 1;
      this.sparks(bolt.x, bolt.y, p.swingFacing, 6, "#fff1d2");
      if (this.phase === "playing") {
        this.combo += 1;
        this.comboT = 1.9;
        if (this.combo > this.bestCombo) this.bestCombo = this.combo;
        const gained = Math.round(25 * comboMult(this.combo));
        this.score += gained;
        this.floater(bolt.x, bolt.y, "CUT", "#fff1d2", 13);
        this.gainHeat(4);
        this.milestone();
      }
    }
    if (hits > 0) {
      this.hitstop = Math.max(this.hitstop, step === 2 ? 0.07 : 0.045);
      this.trauma = Math.min(1, this.trauma + (step === 2 ? 0.58 : 0.36) + Math.min(0.2, hits * 0.04));
      this.punch = Math.min(0.07, this.punch + (step === 2 ? 0.045 : 0.022));
      this.flash = Math.max(this.flash, step === 2 ? 0.22 : 0.1);
      this.sfx.hit(step);
      this.buzz(step === 2 ? 16 : 9);
    }
    if (kills >= 3 && this.phase === "playing") {
      this.floater(p.x, p.y - 44 * this.u, `${kills} CLEAVED`, "#fff6df", 18);
      this.score += 50 * kills;
      this.punch = Math.min(0.08, this.punch + 0.03);
    }
  }

  private strikeEnemy(enemy: Enemy, dmg: number) {
    enemy.hp -= dmg;
    enemy.flash = 0.12;
    enemy.hitScale = 1.38;
    const ang = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
    const kick = (this.player.swingStep === 2 ? 20 : 9) * this.u;
    enemy.x += Math.cos(ang) * kick;
    enemy.y += Math.sin(ang) * kick;
    this.sparks(enemy.x, enemy.y, ang, this.player.swingStep === 2 ? 12 : 7, "#ffd7a1");
    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
      return true;
    }
    this.onHit(10 + dmg * 3, enemy.x, enemy.y - this.er(enemy) - 6);
    return false;
  }

  private onHit(base: number, x: number, y: number) {
    if (this.phase !== "playing") {
      this.gainHeat(4);
      return;
    }
    this.combo += 1;
    this.comboT = 1.9;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const gained = Math.round(base * comboMult(this.combo));
    this.score += gained;
    this.gainHeat(5);
    this.floater(x, y, `+${gained}`, "#ffe1a8", 13);
    this.milestone();
    this.showGuide = 0;
  }

  private killEnemy(enemy: Enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    const color = enemy.kind === "wisp" ? "#9fd7ff" : enemy.kind === "elite" ? "#f4e7cf" : "#ff8a3a";
    this.burst(enemy.x, enemy.y, enemy.kind === "cinder" ? 12 : 20, color);
    this.ring(enemy.x, enemy.y, enemy.kind === "elite" ? 5 : 3, 150 * this.u, color);
    this.sfx.kill();
    this.maybeDrop(enemy);
    if (this.phase !== "playing") {
      this.gainHeat(6);
      return;
    }
    this.kills += 1;
    this.combo += 1;
    this.comboT = 1.9;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const gained = Math.round(enemy.value * comboMult(this.combo));
    this.score += gained;
    this.gainHeat(20);
    this.floater(enemy.x, enemy.y - 16 * this.u, `+${gained}`, "#ffc56a", enemy.kind === "elite" ? 22 : 16);
    this.milestone();
    this.showGuide = 0;
    if (enemy.kind === "brute" || enemy.kind === "elite") this.trauma = Math.min(1, this.trauma + 0.16);
  }

  private maybeDrop(enemy: Enemy) {
    if (this.phase !== "playing" || this.gems.length >= 3) return;
    if (this.player.hp >= this.player.maxHp) return;
    const chance = enemy.kind === "elite" ? 1 : enemy.kind === "brute" ? 0.55 : enemy.kind === "hound" ? 0.2 : enemy.kind === "wisp" ? 0.14 : 0.07;
    if (Math.random() > chance) return;
    this.gems.push({ x: enemy.x, y: enemy.y, vy: -40 * this.u, life: 9 });
  }

  private dashCollide() {
    const p = this.player;
    for (const enemy of this.enemies) {
      if (enemy.dead || this.dashHit.has(enemy.id)) continue;
      if (Math.hypot(enemy.x - p.x, enemy.y - p.y) > this.playerRadius() + this.er(enemy) + 6 * this.u) continue;
      this.dashHit.add(enemy.id);
      if (enemy.state === "lunge") this.phantomHit(enemy);
      else {
        enemy.hp -= 2;
        enemy.flash = 0.1;
        enemy.hitScale = 1.2;
        this.sparks(enemy.x, enemy.y, p.dashAng, 7, "#ffd7a1");
        if (enemy.hp <= 0) this.killEnemy(enemy);
        else this.onHit(8, enemy.x, enemy.y - 8);
      }
    }
  }

  private phantomHit(enemy: Enemy) {
    enemy.hp -= 3;
    enemy.flash = 0.16;
    enemy.hitScale = 1.32;
    this.sparks(enemy.x, enemy.y, this.player.dashAng, 12, "#d7f6ff");
    this.trauma = Math.min(1, this.trauma + 0.24);
    this.sfx.phantom();
    this.buzz(12);
    if (this.phase === "playing") {
      this.combo += 1;
      this.comboT = 1.9;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      this.score += Math.round(100 * comboMult(this.combo));
      this.floater(enemy.x, enemy.y - 26 * this.u, "PHANTOM", "#d7f6ff", 16);
      this.gainHeat(14);
      this.milestone();
    }
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  private tryDash() {
    const p = this.player;
    if ((this.phase !== "playing" && this.phase !== "menu") || p.dashing || p.dashCd > 0) return;
    let ang = p.facing;
    const mag = Math.hypot(this.moveX, this.moveY);
    if (mag > 0.2) ang = Math.atan2(this.moveY, this.moveX);
    else if (this.mouseAim && this.phase === "playing") ang = Math.atan2(this.aim.y - p.y, this.aim.x - p.x);
    p.dashing = true;
    p.dashT = 0.13;
    p.dashCd = DASH_CD;
    p.dashAng = ang;
    p.facing = ang;
    p.swinging = false;
    p.vx = 0;
    p.vy = 0;
    this.dashHit.clear();
    this.dashBuffer = 0;
    this.sfx.dash();
    this.buzz(8);
  }

  private queueDash() {
    if (this.phase !== "playing" && this.phase !== "menu") return;
    this.dashBuffer = 0.14;
    this.tryDash();
  }

  private tryUlt(manual: boolean) {
    if (this.phase !== "playing" && this.phase !== "menu") return;
    if (this.heat < 100 || this.novaT > 0) {
      if (manual && this.phase === "playing") this.sfx.deny();
      return;
    }
    this.heat = 0;
    this.novaAnnounced = false;
    this.novaT = 0.48;
    this.novaDur = 0.48;
    this.novaHit = false;
    this.novaR = 0;
    this.player.invuln = Math.max(this.player.invuln, 0.46);
    this.sfx.novaCharge();
  }

  private updateNova(dt: number) {
    if (this.novaT <= 0) return;
    const age = this.novaDur - this.novaT;
    this.novaT -= dt;
    this.novaR = Math.max(0, age / this.novaDur) * 260 * this.u;
    if (this.novaHit || age < 0.05) return;
    this.novaHit = true;
    this.novaResolving = true;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const d = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
      if (d > this.novaR + 36 * this.u + this.er(enemy)) continue;
      enemy.hp -= 9;
      enemy.flash = 0.16;
      const ang = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
      enemy.x += Math.cos(ang) * 24 * this.u;
      enemy.y += Math.sin(ang) * 24 * this.u;
      if (enemy.hp <= 0) this.killEnemy(enemy);
      else this.onHit(18, enemy.x, enemy.y - 8);
    }
    this.bolts = [];
    this.novaResolving = false;
    this.trauma = Math.min(1, this.trauma + 0.82);
    this.flash = 0.55;
    this.punch = 0.08;
    this.timeScale = 0.32;
    this.scaleHold = 0.3;
    this.sfx.nova();
    this.buzz(36);
    this.ring(this.player.x, this.player.y, 16, 560 * this.u, "#fff1c4");
    this.burst(this.player.x, this.player.y, 34, "#ffb15a");
    this.burst(this.player.x, this.player.y, 16, "#fff6df");
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.hitScale += (1 - enemy.hitScale) * Math.min(1, dt * 14);
      enemy.spawn = Math.max(0, enemy.spawn - dt);
      enemy.cd -= dt;
      enemy.vx *= Math.exp(-7 * dt);
      enemy.vy *= Math.exp(-7 * dt);
      const dx = p.x - enemy.x;
      const dy = p.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      if (enemy.state !== "lunge") enemy.facing = Math.atan2(dy, dx);

      if (enemy.spawn > 0 && enemy.state === "chase") {
        const creep = enemy.baseSpeed * enemy.spdScale * this.u * 0.35 * dt;
        enemy.x += nx * creep;
        enemy.y += ny * creep;
        this.placeEnemy(enemy);
        continue;
      }

      if (enemy.state === "windup") {
        enemy.timer -= dt;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        if (enemy.timer <= 0) {
          enemy.state = "lunge";
          enemy.lungeAng = enemy.facing;
          enemy.timer = enemy.kind === "brute" ? 0.4 : 0.24;
        }
      } else if (enemy.state === "lunge") {
        const spd = (enemy.kind === "brute" ? 310 : 370) * this.u;
        enemy.x += Math.cos(enemy.lungeAng) * spd * dt + enemy.vx * dt;
        enemy.y += Math.sin(enemy.lungeAng) * spd * dt + enemy.vy * dt;
        enemy.timer -= dt;
        if (enemy.timer <= 0) {
          enemy.state = "recover";
          enemy.timer = 0.32;
        }
      } else if (enemy.state === "slam") {
        enemy.timer -= dt;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        if (enemy.timer <= 0) {
          this.detonate(enemy);
          enemy.state = "recover";
          enemy.timer = 0.46;
        }
      } else if (enemy.state === "recover") {
        enemy.timer -= dt;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        if (enemy.timer <= 0) enemy.state = "chase";
      } else {
        let mx = nx;
        let my = ny;
        let spd = enemy.baseSpeed * enemy.spdScale * this.u;
        if (enemy.kind === "wisp") {
          const prefer = 150 * this.u;
          if (dist < prefer * 0.85) {
            mx = -nx;
            my = -ny;
          } else if (dist < prefer + 34 * this.u) {
            mx = -ny;
            my = nx;
            spd *= 0.85;
          }
          if (enemy.cd <= 0 && dist < 290 * this.u) {
            this.shoot(enemy);
            enemy.cd = Math.max(1.15, 1.9 - this.battle * 0.035);
          }
        } else if (enemy.kind === "hound" && enemy.cd <= 0 && dist < 180 * this.u && dist > 42 * this.u) {
          enemy.state = "windup";
          enemy.timer = 0.32;
          enemy.cd = 2.35;
        } else if (enemy.kind === "brute" && enemy.cd <= 0 && dist < 240 * this.u && dist > 72 * this.u) {
          enemy.state = "windup";
          enemy.timer = 0.5;
          enemy.cd = 3.15;
        } else if (enemy.kind === "elite" && enemy.cd <= 0 && dist < 210 * this.u) {
          enemy.state = "slam";
          enemy.timer = 0.74;
          enemy.cd = 2.8;
          enemy.slamX = enemy.x;
          enemy.slamY = enemy.y;
        }
        if (enemy.state === "chase") {
          let sx = 0;
          let sy = 0;
          for (const other of this.enemies) {
            if (other === enemy || other.dead) continue;
            const ox = enemy.x - other.x;
            const oy = enemy.y - other.y;
            const od = Math.hypot(ox, oy);
            const min = this.er(enemy) + this.er(other) + 4 * this.u;
            if (od > 0 && od < min) {
              sx += (ox / od) * (min - od);
              sy += (oy / od) * (min - od);
            }
          }
          enemy.x += (mx * spd + enemy.vx + sx * 3) * dt;
          enemy.y += (my * spd + enemy.vy + sy * 3) * dt;
        }
      }
      this.placeEnemy(enemy);
      this.touchPlayer(enemy);
    }
  }

  private detonate(enemy: Enemy) {
    const radius = 72 * this.u;
    this.ring(enemy.slamX, enemy.slamY, 8, 240 * this.u, "#ff4d3a");
    this.burst(enemy.slamX, enemy.slamY, 14, "#ff5a3a");
    this.trauma = Math.min(1, this.trauma + 0.22);
    const d = Math.hypot(this.player.x - enemy.slamX, this.player.y - enemy.slamY);
    if (d < radius + this.playerRadius() * 0.35) this.hurt(18, enemy.slamX, enemy.slamY);
  }

  private touchPlayer(enemy: Enemy) {
    if (this.phase !== "playing" || enemy.spawn > 0 || enemy.dead) return;
    if (this.player.invuln > 0 || this.player.dashing) return;
    const reach = this.er(enemy) + this.playerRadius() + (enemy.state === "lunge" ? 4 * this.u : 0);
    if (Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) < reach) {
      this.hurt(enemy.state === "lunge" ? enemy.damage + 6 : enemy.damage, enemy.x, enemy.y);
    }
  }

  private shoot(enemy: Enemy) {
    if (this.bolts.length > 20) return;
    const ang = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x) + (Math.random() - 0.5) * 0.15;
    const speed = 148 * this.u;
    this.bolts.push({
      id: this.nextId++,
      x: enemy.x + Math.cos(ang) * this.er(enemy),
      y: enemy.y + Math.sin(ang) * this.er(enemy),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r: 5.5 * this.u,
      life: 3.1,
      dmg: 10,
    });
  }

  private updateBolts(dt: number) {
    for (const bolt of this.bolts) {
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      bolt.life -= dt;
      if (Math.hypot(bolt.x - this.arena.x, bolt.y - this.arena.y) > this.arena.r - 4) bolt.life = 0;
      if (bolt.life <= 0) continue;
      const d = Math.hypot(bolt.x - this.player.x, bolt.y - this.player.y);
      if (this.player.dashing && d < this.playerRadius() + bolt.r + 4) {
        bolt.life = 0;
        this.sparks(bolt.x, bolt.y, this.player.dashAng, 6, "#d7f6ff");
        if (this.phase === "playing") this.score += 15;
        continue;
      }
      if (this.player.invuln > 0 || this.player.dashing) continue;
      if (d < this.playerRadius() + bolt.r) {
        bolt.life = 0;
        this.hurt(bolt.dmg, bolt.x, bolt.y);
      }
    }
  }

  private updateGems(dt: number) {
    for (const gem of this.gems) {
      gem.life -= dt;
      gem.vy += 50 * this.u * dt;
      gem.y += gem.vy * dt;
      const c = this.constrain(gem.x, gem.y, 8 * this.u);
      gem.x = c.x;
      gem.y = c.y;
      if (c.hit) gem.vy *= -0.25;
      const dx = this.player.x - gem.x;
      const dy = this.player.y - gem.y;
      const d = Math.hypot(dx, dy);
      if (d < 80 * this.u && d > 0) {
        gem.x += (dx / d) * 240 * this.u * dt;
        gem.y += (dy / d) * 240 * this.u * dt;
      }
      if (d < 20 * this.u && this.phase === "playing") {
        gem.life = 0;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 26);
        this.floater(this.player.x, this.player.y - 24 * this.u, "MEND", "#b6ffc8", 15);
        this.sfx.pickup();
        this.burst(gem.x, gem.y, 8, "#ffe0a8");
      }
    }
  }

  private updateSpawn(dt: number) {
    this.spawnCd -= dt;
    if (this.phase === "menu") {
      const alive = this.enemies.some((enemy) => !enemy.dead);
      if (this.spawnCd <= 0 && this.enemies.filter((enemy) => !enemy.dead).length < 5) {
        const kinds: Kind[] = ["cinder", "cinder", "hound", "wisp", "cinder"];
        this.spawn(kinds[Math.floor(Math.random() * kinds.length)] ?? "cinder");
        this.spawnCd = 0.85;
      } else if (!alive && this.spawnCd <= 0) {
        this.spawn("cinder");
        this.spawnCd = 0.4;
      }
      return;
    }
    if (this.clearing) return;
    const alive = this.enemies.reduce((n, enemy) => n + (enemy.dead ? 0 : 1), 0);
    const cap = Math.min(15, 6 + Math.floor(this.battle * 0.7));
    if (this.spawnCd <= 0 && this.queue.length > 0 && alive < cap) {
      const kind = this.queue.shift();
      if (kind) this.spawn(kind);
      this.spawnCd = Math.max(0.28, 0.66 - this.battle * 0.03);
    }
  }

  private checkClear(dt: number) {
    if (this.battle < 1) return;
    const alive = this.enemies.some((enemy) => !enemy.dead);
    if (!this.clearing && !alive && this.queue.length === 0) {
      this.clearing = true;
      this.clearT = 0.82;
      const bonus = 200 * this.battle;
      this.score += bonus;
      this.gainHeat(8);
      this.floater(this.arena.x, this.arena.y - 8 * this.u, `RING CLEAR +${bonus}`, "#fff1d4", 18);
      this.timeScale = 0.4;
      this.scaleHold = 0.18;
      this.punch = Math.min(0.08, this.punch + 0.035);
      if (this.player.hp < this.player.maxHp * 0.55) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
        this.floater(this.player.x, this.player.y - 26 * this.u, "MEND", "#b6ffc8", 14);
      }
      this.sfx.wave();
    }
    if (!this.clearing) return;
    this.clearT -= dt;
    if (this.clearT <= 0) {
      this.clearing = false;
      this.beginBattle(this.battle + 1);
    }
  }

  private beginBattle(n: number) {
    this.battle = n;
    this.queue = compose(n);
    this.spawnCd = n === 1 ? 0.5 : 0.42;
    this.clearing = false;
    this.bannerT = 1.65;
    this.banner = `BATTLE ${toRoman(n)}`;
    this.bannerSub = battleSub(n);
    if (n === 1) {
      const a = this.queue.shift();
      const b = this.queue.shift();
      const c = this.queue.shift();
      if (a) this.spawn(a, -Math.PI / 2, 0.3, 0.02);
      if (b) this.spawn(b, -Math.PI / 2 + 0.74, 0.64, 0.12);
      if (c) this.spawn(c, -Math.PI / 2 - 0.8, 0.72, 0.16);
    } else {
      this.ring(this.arena.x, this.arena.y, 6, 220 * this.u, "#e4b15a");
    }
  }

  private spawn(kind: Kind, angle?: number, frac?: number, spawnTime = 0.32) {
    const stats = STATS[kind];
    const ang = angle ?? Math.random() * Math.PI * 2;
    const live = this.phase === "playing";
    const hpScale = live ? Math.min(1.65, 1 + Math.max(0, this.battle - 1) * 0.07) : 1;
    const spdScale = live ? Math.min(1.28, 1 + Math.max(0, this.battle - 1) * 0.025) : 1;
    const hp = Math.max(1, Math.round(stats.hp * hpScale));
    const enemy: Enemy = {
      id: this.nextId++,
      kind,
      x: this.arena.x + Math.cos(ang) * this.arena.r * (frac ?? 0.94),
      y: this.arena.y + Math.sin(ang) * this.arena.r * (frac ?? 0.94),
      vx: 0,
      vy: 0,
      baseRadius: stats.radius,
      baseSpeed: stats.speed,
      hp,
      maxHp: hp,
      damage: stats.damage,
      value: stats.value,
      facing: ang + Math.PI,
      state: "chase",
      timer: 0,
      cd: 0.35 + Math.random() * 0.7,
      flash: 0,
      spawn: spawnTime,
      seed: Math.random() * 10,
      dead: false,
      hitScale: 1,
      lungeAng: 0,
      slamX: 0,
      slamY: 0,
      spdScale,
    };
    this.enemies.push(enemy);
    this.ring(enemy.x, enemy.y, 2, 70 * this.u, kind === "elite" ? "#f4e7cf" : "#ff8a3a");
    if (kind === "elite" && live) {
      this.floater(enemy.x, enemy.y - 30 * this.u, "MOONBRAND", "#f4e7cf", 16);
      this.sfx.ready();
    }
  }

  private hurt(amount: number, srcX: number, srcY: number) {
    if (this.phase !== "playing" || this.player.invuln > 0 || this.player.dashing) return;
    const p = this.player;
    p.hp = Math.max(0, p.hp - amount);
    p.invuln = 0.85;
    this.hurtFlash = 0.72;
    this.trauma = Math.min(1, this.trauma + 0.7);
    this.sfx.hurt();
    this.buzz(28);
    const ang = Math.atan2(p.y - srcY, p.x - srcX);
    p.vx = Math.cos(ang) * 280 * this.u;
    p.vy = Math.sin(ang) * 280 * this.u;
    this.floater(p.x, p.y - 22 * this.u, `-${amount}`, "#ff6a6a", 16);
    if (p.hp <= 0) this.die();
  }

  private die() {
    if (this.phase !== "playing") return;
    this.player.hp = 0;
    this.deathT = 0.7;
    this.trauma = 1;
    this.flash = 0.5;
    this.burst(this.player.x, this.player.y, 28, "#ffb15a");
    this.burst(this.player.x, this.player.y, 12, "#fff1d2");
    this.ring(this.player.x, this.player.y, 8, 320 * this.u, "#ff6a2c");
    this.sfx.die();
    this.buzz(40);
    this.reportOver();
    this.notify("dying");
  }

  private reportOver() {
    if (this.reported) return;
    this.reported = true;
    this.hooks.onOver({
      score: this.score,
      battle: Math.max(1, this.battle),
      bestCombo: this.bestCombo,
      kills: this.kills,
      time: this.runTime,
    });
  }

  private gainHeat(amount: number) {
    if (this.novaResolving) return;
    this.heat = Math.min(100, this.heat + amount);
    if (this.heat >= 100 && !this.novaAnnounced && this.phase === "playing") {
      this.novaAnnounced = true;
      this.floater(this.player.x, this.player.y - 38 * this.u, "NOVA READY", "#fff1c4", 15);
      this.sfx.ready();
    }
  }

  private milestone() {
    if (this.phase !== "playing") return;
    const rank = this.combo >= 30 ? 4 : this.combo >= 20 ? 3 : this.combo >= 12 ? 2 : this.combo >= 6 ? 1 : 0;
    if (rank <= this.comboRank) return;
    this.comboRank = rank;
    const titles = ["", "KINDLED", "BLAZING", "INFERNO", "ECLIPSE"];
    this.floater(this.player.x, this.player.y - 50 * this.u, titles[rank] ?? "", "#fff6df", 20);
    this.sfx.ready();
    this.punch = Math.min(0.06, this.punch + 0.03);
  }

  private updateParticles(dt: number) {
    for (const particle of this.particles) {
      particle.vx *= Math.exp(-particle.drag * dt);
      particle.vy = particle.vy * Math.exp(-particle.drag * dt) + particle.grav * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }
  }

  private updateFloaters(dt: number) {
    for (const floater of this.floaters) {
      floater.y += floater.vy * dt;
      floater.life -= dt;
    }
  }

  private updateRings(dt: number) {
    for (const ring of this.rings) {
      ring.r += ring.vr * dt;
      ring.life -= dt;
    }
  }

  private ambient(dt: number) {
    this.ambientAcc += dt;
    if (this.ambientAcc < 0.08) return;
    this.ambientAcc = 0;
    if (this.particles.length > this.maxParticles() * 0.85) return;
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * this.arena.r * 0.92;
    const life = 0.8 + Math.random() * 0.7;
    this.pushParticle({
      x: this.arena.x + Math.cos(ang) * dist,
      y: this.arena.y + Math.sin(ang) * dist,
      vx: (Math.random() - 0.5) * 8,
      vy: -12 - Math.random() * 18,
      life,
      max: life,
      size: (1 + Math.random() * 1.5) * Math.max(0.75, this.u),
      color: Math.random() > 0.45 ? "#ff8a3a" : "#ffd48a",
      drag: 0.25,
      grav: -6,
      streak: false,
    });
  }

  private hitsArc(tx: number, ty: number, radius: number, reach: number, width: number) {
    const dx = tx - this.player.x;
    const dy = ty - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > reach + radius) return false;
    if (dist < this.playerRadius() + radius * 0.45) return true;
    const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - this.player.swingFacing), Math.cos(Math.atan2(dy, dx) - this.player.swingFacing));
    return Math.abs(diff) <= width / 2;
  }

  private er(enemy: Enemy) {
    return enemy.baseRadius * this.u;
  }

  private playerRadius() {
    return 15 * this.u;
  }

  private constrain(x: number, y: number, radius: number) {
    const dx = x - this.arena.x;
    const dy = y - this.arena.y;
    const dist = Math.hypot(dx, dy);
    const max = Math.max(8, this.arena.r - radius);
    if (dist > max && dist > 0) {
      const k = max / dist;
      return { x: this.arena.x + dx * k, y: this.arena.y + dy * k, hit: true };
    }
    return { x, y, hit: false };
  }

  private shovePlayer() {
    const c = this.constrain(this.player.x, this.player.y, this.playerRadius());
    this.player.x = c.x;
    this.player.y = c.y;
    if (!c.hit) return;
    const nx = (this.player.x - this.arena.x) / this.arena.r;
    const ny = (this.player.y - this.arena.y) / this.arena.r;
    const vn = this.player.vx * nx + this.player.vy * ny;
    if (vn > 0) {
      this.player.vx -= nx * vn;
      this.player.vy -= ny * vn;
    }
  }

  private placeEnemy(enemy: Enemy) {
    const c = this.constrain(enemy.x, enemy.y, this.er(enemy));
    enemy.x = c.x;
    enemy.y = c.y;
  }

  private burst(x: number, y: number, count: number, color: string) {
    const n = Math.max(3, Math.round(count * this.quality));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = (50 + Math.random() * 170) * this.u;
      const life = 0.32 + Math.random() * 0.38;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 16 * this.u,
        life,
        max: life,
        size: (1.3 + Math.random() * 2.3) * this.u,
        color,
        drag: 2.1,
        grav: -16 * this.u,
        streak: Math.random() > 0.55,
      });
    }
  }

  private sparks(x: number, y: number, ang: number, count: number, color: string) {
    const n = Math.max(2, Math.round(count * this.quality));
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * 1.4;
      const speed = (80 + Math.random() * 180) * this.u;
      const life = 0.18 + Math.random() * 0.22;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life,
        max: life,
        size: (1.2 + Math.random() * 1.5) * this.u,
        color,
        drag: 3.4,
        grav: 0,
        streak: true,
      });
    }
  }

  private whoosh(step: number) {
    const p = this.player;
    const n = step === 2 ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = p.swingFacing + (step === 2 ? -2.2 + t * 4.4 : (t - 0.5) * 1.8);
      const rad = (step === 2 ? 60 : 46) * this.u;
      const life = 0.16;
      this.pushParticle({
        x: p.x + Math.cos(a) * rad,
        y: p.y + Math.sin(a) * rad,
        vx: Math.cos(a) * 40,
        vy: Math.sin(a) * 40,
        life,
        max: life,
        size: (step === 2 ? 3 : 2) * this.u,
        color: "#fff1d2",
        drag: 4,
        grav: 0,
        streak: true,
      });
    }
  }

  private ring(x: number, y: number, width: number, vr: number, color: string) {
    if (this.rings.length > 28) this.rings.shift();
    this.rings.push({ x, y, r: 8 * this.u, vr, life: 0.38, max: 0.38, color, width });
  }

  private floater(x: number, y: number, text: string, color: string, size: number) {
    this.floaters.push({
      x: x + (Math.random() - 0.5) * 8,
      y,
      vy: -36 * Math.max(0.75, this.u),
      life: 0.72,
      max: 0.72,
      text,
      color,
      size: size * Math.max(0.78, Math.min(1.25, this.u)),
    });
    if (this.floaters.length > 36) this.floaters.splice(0, this.floaters.length - 36);
  }

  private pushParticle(particle: Particle) {
    const cap = this.maxParticles();
    if (this.particles.length >= cap) this.particles.shift();
    this.particles.push(particle);
  }

  private maxParticles() {
    return Math.floor(240 * this.quality);
  }

  private prune() {
    if (this.enemies.some((enemy) => enemy.dead)) this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    if (this.bolts.some((bolt) => bolt.life <= 0)) this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
    if (this.gems.some((gem) => gem.life <= 0)) this.gems = this.gems.filter((gem) => gem.life > 0);
    if (this.particles.some((particle) => particle.life <= 0)) this.particles = this.particles.filter((particle) => particle.life > 0);
    if (this.floaters.some((floater) => floater.life <= 0)) this.floaters = this.floaters.filter((floater) => floater.life > 0);
    if (this.rings.some((ring) => ring.life <= 0)) this.rings = this.rings.filter((ring) => ring.life > 0);
    if (this.ghosts.some((ghost) => ghost.life <= 0)) this.ghosts = this.ghosts.filter((ghost) => ghost.life > 0);
  }

  private buzz(ms: number) {
    if (this.reduce) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* unsupported */
    }
  }

  private clearWorld() {
    this.enemies = [];
    this.bolts = [];
    this.gems = [];
    this.particles = [];
    this.floaters = [];
    this.rings = [];
    this.ghosts = [];
    this.queue = [];
    this.swingHit.clear();
    this.dashHit.clear();
    const p = this.player;
    p.vx = 0;
    p.vy = 0;
    p.dashing = false;
    p.swinging = false;
    p.dashCd = 0;
    p.dashT = 0;
    p.atkCd = 0;
    p.chainStep = 0;
    p.chainT = 0;
    p.invuln = 0;
    p.hp = p.maxHp;
    this.hitstop = 0;
    this.novaT = 0;
    this.novaHit = false;
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.comboRank = 0;
    this.bestCombo = 0;
    this.kills = 0;
    this.runTime = 0;
    this.battle = 0;
    this.clearing = false;
    this.heat = 0;
    this.novaAnnounced = false;
    this.trauma = 0;
    this.punch = 0;
    this.timeScale = 1;
    this.scaleHold = 0;
    this.bannerT = 0;
    this.flash = 0;
    this.hurtFlash = 0;
    this.deathT = 0;
    this.atkBuffer = 0;
    this.dashBuffer = 0;
    this.nextId = 1;
  }

  private resetMenu() {
    this.clearWorld();
    this.player.x = this.arena.x;
    this.player.y = this.arena.y;
    this.player.facing = -Math.PI / 2;
    this.heat = 40;
    this.spawn("cinder", -0.4, 0.55, 0.05);
    this.spawn("hound", 1.2, 0.72, 0.05);
    this.spawn("wisp", 2.4, 0.8, 0.05);
    this.spawn("cinder", -2, 0.66, 0.05);
    this.notify("menu");
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const prev = { ...this.arena };
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.layout();
    if (prev.r > 8) this.remap(prev);
    this.rebuildSky();
    this.rebuildArena();
  }

  private layout() {
    const compact = this.w < 860 || this.h < 540;
    const top = 64;
    const bottomReserve = compact ? Math.min(172, this.h * 0.26) : 20;
    const bottom = this.h - bottomReserve;
    const span = bottom - top;
    if (span < 120) {
      this.arena.r = Math.max(88, Math.min(this.w, this.h) * 0.3);
      this.arena.x = this.w / 2;
      this.arena.y = this.h * 0.46;
    } else {
      const maxR = Math.min((this.w - 18) / 2, span / 2, compact ? 214 : 390);
      this.arena.r = Math.max(104, maxR);
      this.arena.x = this.w / 2;
      this.arena.y = top + span / 2;
    }
    this.u = this.arena.r / 230;
  }

  private remap(prev: { x: number; y: number; r: number }) {
    const map = (x: number, y: number) => ({
      x: this.arena.x + ((x - prev.x) / prev.r) * this.arena.r,
      y: this.arena.y + ((y - prev.y) / prev.r) * this.arena.r,
    });
    const player = map(this.player.x, this.player.y);
    this.player.x = player.x;
    this.player.y = player.y;
    for (const enemy of this.enemies) {
      const next = map(enemy.x, enemy.y);
      enemy.x = next.x;
      enemy.y = next.y;
      const slam = map(enemy.slamX, enemy.slamY);
      enemy.slamX = slam.x;
      enemy.slamY = slam.y;
    }
    for (const bolt of this.bolts) {
      const next = map(bolt.x, bolt.y);
      bolt.x = next.x;
      bolt.y = next.y;
    }
    for (const gem of this.gems) {
      const next = map(gem.x, gem.y);
      gem.x = next.x;
      gem.y = next.y;
    }
  }

  private makeCanvas(w: number, h: number) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * this.dpr));
    canvas.height = Math.max(1, Math.round(h * this.dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return { canvas, ctx };
  }

  private rebuildSky() {
    const made = this.makeCanvas(this.w, this.h);
    if (!made) return;
    this.sky = made.canvas;
    const ctx = made.ctx;
    const { w, h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#16110f");
    sky.addColorStop(0.42, "#120e0c");
    sky.addColorStop(1, "#070605");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const rng = mulberry32(11);
    for (let i = 0; i < 90; i++) {
      const x = rng() * w;
      const y = rng() * h * 0.72;
      ctx.fillStyle = `rgba(255, 236, 214, ${0.15 + rng() * 0.55})`;
      ctx.fillRect(x, y, rng() > 0.85 ? 1.8 : 1.1, rng() > 0.85 ? 1.8 : 1.1);
    }
    const mx = w * 0.78;
    const my = h * 0.18;
    const mr = Math.min(w, h) * 0.13;
    const glow = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.6);
    glow.addColorStop(0, "rgba(255, 236, 210, 0.18)");
    glow.addColorStop(1, "rgba(255, 236, 210, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 2.6, 0, Math.PI * 2);
    ctx.fill();
    const moon = ctx.createRadialGradient(mx - mr * 0.32, my - mr * 0.34, mr * 0.1, mx, my, mr);
    moon.addColorStop(0, "#fff8ee");
    moon.addColorStop(0.55, "#e6d9c8");
    moon.addColorStop(1, "#b7aa9a");
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(80, 68, 58, 0.18)";
    for (const [cx, cy, cr] of [
      [-0.28, -0.08, 0.2],
      [0.22, 0.16, 0.14],
      [0.02, 0.32, 0.09],
      [-0.12, 0.22, 0.07],
    ] as const) {
      ctx.beginPath();
      ctx.arc(mx + cx * mr, my + cy * mr, cr * mr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(mx - mr * 0.08, my - mr * 0.86);
    ctx.lineTo(mx + mr * 0.06, my - mr * 0.28);
    ctx.lineTo(mx - mr * 0.14, my - mr * 0.02);
    ctx.lineTo(mx + mr * 0.1, my + mr * 0.36);
    ctx.lineTo(mx - mr * 0.02, my + mr * 0.82);
    ctx.strokeStyle = "rgba(255, 122, 48, 0.9)";
    ctx.lineWidth = Math.max(2, mr * 0.035);
    ctx.stroke();
    ctx.save();
    ctx.translate(mx + mr * 1.15, my + mr * 0.35);
    ctx.rotate(0.5);
    ctx.fillStyle = "#d9d0c4";
    ctx.beginPath();
    ctx.moveTo(0, -mr * 0.28);
    ctx.lineTo(mr * 0.18, 0);
    ctx.lineTo(0, mr * 0.16);
    ctx.lineTo(-mr * 0.12, -mr * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#0c0908";
    const base = h * 0.38;
    for (let i = 0; i < 14; i++) {
      const x = (i / 13) * w;
      const peak = base - (28 + ((i * 37) % 50));
      ctx.beginPath();
      ctx.moveTo(x - 26, base + 20);
      ctx.lineTo(x, peak);
      ctx.lineTo(x + 30, base + 20);
      ctx.fill();
    }
    const haze = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.62);
    haze.addColorStop(0, "rgba(255, 120, 40, 0)");
    haze.addColorStop(0.5, "rgba(255, 90, 30, 0.05)");
    haze.addColorStop(1, "rgba(255, 90, 30, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.3, w, h * 0.32);
  }

  private rebuildArena() {
    const r = this.arena.r;
    const pad = 78 * this.u + 28;
    const size = (r + pad) * 2;
    const made = this.makeCanvas(size, size);
    if (!made) return;
    this.disc = made.canvas;
    this.discSize = size;
    const ctx = made.ctx;
    const cx = size / 2;
    const cy = size / 2;
    ctx.save();
    ctx.translate(cx, cy + 16 * this.u);
    ctx.scale(1, 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fill();
    ctx.restore();
    const floor = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r);
    floor.addColorStop(0, "#4a3428");
    floor.addColorStop(0.45, "#2a1c16");
    floor.addColorStop(1, "#140e0c");
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 196, 120, 0.08)";
    ctx.lineWidth = 1;
    for (const frac of [0.28, 0.48, 0.7, 0.86]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * frac, 0, Math.PI * 2);
      ctx.stroke();
    }
    const rng = mulberry32(29);
    ctx.strokeStyle = "rgba(255, 110, 40, 0.28)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const ang = rng() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 8, cy + Math.sin(ang) * 8);
      let x = cx;
      let y = cy;
      for (let s = 0; s < 4; s++) {
        x += Math.cos(ang + (rng() - 0.5)) * r * 0.22;
        y += Math.sin(ang + (rng() - 0.5)) * r * 0.22;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 22 * this.u, 0, Math.PI * 2);
    ctx.fillStyle = "#1a0c08";
    ctx.fill();
    ctx.strokeStyle = "rgba(228, 177, 90, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + 0.2;
      const dist = r + 16 * this.u;
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang + Math.PI / 2);
      const height = (26 + (i % 4) * 9) * this.u;
      const width = 11 * this.u;
      ctx.beginPath();
      ctx.moveTo(-width, 8 * this.u);
      ctx.lineTo(-width * 0.62, -height);
      ctx.lineTo(width * 0.62, -height);
      ctx.lineTo(width, 8 * this.u);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? "#1c1512" : "#261b16";
      ctx.fill();
      ctx.strokeStyle = "rgba(228, 177, 90, 0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  private draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.sky) ctx.drawImage(this.sky, 0, 0, this.w, this.h);
    else {
      ctx.fillStyle = "#100e0c";
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.save();
    ctx.translate(this.arena.x + this.shakeX, this.arena.y + this.shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.arena.x, -this.arena.y);
    if (this.disc) {
      ctx.drawImage(this.disc, this.arena.x - this.discSize / 2, this.arena.y - this.discSize / 2, this.discSize, this.discSize);
    }
    this.drawFloorFx(ctx);
    this.drawTelegraphs(ctx);
    for (const enemy of this.enemies) this.shadow(ctx, enemy.x, enemy.y, this.er(enemy));
    if (this.phase !== "dying") this.shadow(ctx, this.player.x, this.player.y, this.playerRadius());
    this.drawGems(ctx);
    const ordered = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const enemy of ordered) this.drawEnemy(ctx, enemy);
    this.drawGhosts(ctx);
    if (this.phase !== "dying" || this.deathT > 0.38) this.drawPlayer(ctx);
    this.drawSwing(ctx);
    this.drawBolts(ctx);
    this.drawParticles(ctx);
    this.drawRingFx(ctx);
    this.drawNova(ctx);
    this.drawFloaters(ctx);
    this.drawBanner(ctx);
    this.drawGuide(ctx);
    ctx.restore();
    this.drawVignette(ctx);
    this.drawReticle(ctx);
    this.canvas.style.cursor = this.phase === "playing" && this.mouseAim ? "none" : this.phase === "playing" ? "crosshair" : "default";
  }

  private drawFloorFx(ctx: CanvasRenderingContext2D) {
    const { x, y, r } = this.arena;
    const pulse = 0.78 + Math.sin(this.anim * 2.3) * 0.22;
    const rad = 58 * this.u * pulse;
    const glow = ctx.createRadialGradient(x, y, 2, x, y, rad);
    glow.addColorStop(0, `rgba(255, 196, 110, ${0.55 * pulse})`);
    glow.addColorStop(0.5, `rgba(255, 100, 30, ${0.18 * pulse})`);
    glow.addColorStop(1, "rgba(255, 80, 20, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.anim * 0.12);
    ctx.strokeStyle = "rgba(228, 177, 90, 0.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      ctx.moveTo(Math.cos(ang) * r * 0.58, Math.sin(ang) * r * 0.58);
      ctx.lineTo(Math.cos(ang) * r * 0.66, Math.sin(ang) * r * 0.66);
    }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 214, 150, 0.38)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  private drawTelegraphs(ctx: CanvasRenderingContext2D) {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.state === "windup") {
        const len = (enemy.kind === "brute" ? 128 : 88) * this.u;
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(enemy.x + Math.cos(enemy.facing) * len, enemy.y + Math.sin(enemy.facing) * len);
        ctx.strokeStyle = "rgba(255, 70, 48, 0.78)";
        ctx.lineWidth = (enemy.kind === "brute" ? 10 : 5) * this.u;
        ctx.setLineDash([5 * this.u, 7 * this.u]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (enemy.state === "slam") {
        const t = 1 - enemy.timer / 0.74;
        const vis = (16 + Math.max(0, t) * 82) * this.u;
        ctx.beginPath();
        ctx.arc(enemy.slamX, enemy.slamY, vis, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 50, 36, ${0.08 + Math.max(0, t) * 0.16})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 90, 60, ${0.45 + Math.sin(this.anim * 26) * 0.25})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    ctx.save();
    ctx.translate(x, y + radius * 0.72);
    ctx.scale(1, 0.38);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fill();
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
    const radius = this.er(enemy);
    const bob = enemy.kind === "wisp" ? Math.sin(this.anim * 3 + enemy.seed) * 6 * this.u : 0;
    const flash = enemy.flash > 0.05;
    const spawnSc = enemy.spawn > 0 ? Math.max(0.4, 1 - enemy.spawn * 1.5) : 1;
    ctx.save();
    ctx.translate(enemy.x, enemy.y + bob);
    ctx.rotate(enemy.facing);
    ctx.scale(enemy.hitScale * spawnSc, enemy.hitScale * spawnSc);
    if (enemy.spawn > 0) ctx.globalAlpha = 0.55 + Math.sin(this.anim * 28) * 0.2;
    if (enemy.kind === "cinder") this.drawCinder(ctx, radius, flash);
    else if (enemy.kind === "hound") this.drawHound(ctx, radius, flash);
    else if (enemy.kind === "brute") this.drawBrute(ctx, radius, flash);
    else if (enemy.kind === "wisp") this.drawWisp(ctx, radius, flash, enemy.seed);
    else this.drawElite(ctx, radius, flash);
    ctx.restore();
    if ((enemy.kind === "brute" || enemy.kind === "elite") && enemy.hp < enemy.maxHp) {
      const w = radius * 2.1;
      const y = enemy.y - radius - 10 * this.u;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(enemy.x - w / 2, y, w, 3.2 * this.u);
      ctx.fillStyle = enemy.kind === "elite" ? "#f4e7cf" : "#ff6a3a";
      ctx.fillRect(enemy.x - w / 2, y, w * Math.max(0, enemy.hp / enemy.maxHp), 3.2 * this.u);
    }
  }

  private drawCinder(ctx: CanvasRenderingContext2D, radius: number, flash: boolean) {
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      const rr = i % 2 === 0 ? radius : radius * 0.58;
      const x = Math.cos(ang) * rr;
      const y = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = flash ? "#fff6ee" : "#2a100e";
    ctx.fill();
    ctx.strokeStyle = "#ff5a32";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(radius * 0.15, 0, radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = flash ? "#fff" : "#ff7a3c";
    ctx.fill();
  }

  private drawHound(ctx: CanvasRenderingContext2D, radius: number, flash: boolean) {
    ctx.fillStyle = flash ? "#fff6ee" : "#241416";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.15, 0, radius * 1.25, radius * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(radius * 0.85, -radius * 0.05, radius * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(radius * 0.7, -radius * 0.35);
    ctx.lineTo(radius * 0.95, -radius * 0.95);
    ctx.lineTo(radius * 1.15, -radius * 0.3);
    ctx.moveTo(radius * 1.05, -radius * 0.28);
    ctx.lineTo(radius * 1.35, -radius * 0.82);
    ctx.lineTo(radius * 1.3, -radius * 0.15);
    ctx.fill();
    ctx.strokeStyle = "#e15a42";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = flash ? "#fff" : "#ffb15a";
    ctx.fillRect(radius * 1.05, -radius * 0.12, radius * 0.28, radius * 0.1);
  }

  private drawBrute(ctx: CanvasRenderingContext2D, radius: number, flash: boolean) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(ang) * radius;
      const y = Math.sin(ang) * radius * 0.92;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = flash ? "#fff6ee" : "#3a2a26";
    ctx.fill();
    ctx.strokeStyle = "#e4b15a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(radius * 0.15, -radius * 0.2);
    ctx.lineTo(radius * 0.7, -radius * 0.85);
    ctx.lineTo(radius * 0.35, -radius * 0.05);
    ctx.fillStyle = flash ? "#fff" : "#ff6a2c";
    ctx.fill();
    ctx.fillStyle = flash ? "#fff" : "#ff8a3a";
    ctx.fillRect(radius * 0.35, -radius * 0.12, radius * 0.28, radius * 0.1);
  }

  private drawWisp(ctx: CanvasRenderingContext2D, radius: number, flash: boolean, seed: number) {
    ctx.rotate(Math.sin(this.anim * 2 + seed) * 0.2);
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(0, radius * 0.72);
    ctx.lineTo(-radius * 0.85, 0);
    ctx.lineTo(0, -radius * 0.72);
    ctx.closePath();
    ctx.fillStyle = flash ? "#fff" : "rgba(18, 28, 36, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "#8fd4ff";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "#ffb15a";
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const ang = this.anim * 2.4 + seed + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * radius * 0.85, Math.sin(ang) * radius * 0.85, 1.6 * this.u, 0, Math.PI * 2);
      ctx.fillStyle = i === 1 ? "#ffd48a" : "#bfe8ff";
      ctx.fill();
    }
  }

  private drawElite(ctx: CanvasRenderingContext2D, radius: number, flash: boolean) {
    ctx.fillStyle = flash ? "#fff6ee" : "#2a211c";
    ctx.beginPath();
    ctx.moveTo(-radius * 0.2, -radius * 0.2);
    ctx.lineTo(-radius * 1.1, radius * 0.7);
    ctx.lineTo(-radius * 0.1, radius * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius * 0.72, radius * 0.15);
    ctx.lineTo(0, radius * 0.85);
    ctx.lineTo(-radius * 0.55, radius * 0.15);
    ctx.closePath();
    ctx.fillStyle = flash ? "#fff" : "#1a1614";
    ctx.fill();
    ctx.strokeStyle = "#f4e7cf";
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-radius * 0.28, -radius * 0.72);
    ctx.lineTo(0, -radius * 1.25);
    ctx.lineTo(radius * 0.28, -radius * 0.72);
    ctx.stroke();
    ctx.fillStyle = "#ff3b3b";
    ctx.fillRect(radius * 0.08, -radius * 0.08, radius * 0.34, radius * 0.08);
  }

  private drawGhosts(ctx: CanvasRenderingContext2D) {
    for (const ghost of this.ghosts) {
      ctx.save();
      ctx.translate(ghost.x, ghost.y);
      ctx.rotate(ghost.facing);
      ctx.globalAlpha = Math.max(0, ghost.life / 0.2) * 0.4;
      ctx.fillStyle = "#ffb15a";
      ctx.beginPath();
      ctx.ellipse(0, 0, 8 * this.u, 11 * this.u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    const u = this.u;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && this.phase === "playing" && Math.sin(this.anim * 42) > 0.15) ctx.globalAlpha = 0.5;
    ctx.rotate(p.facing);
    const flutter = Math.sin(this.anim * 14 + Math.hypot(p.vx, p.vy) * 0.02) * 2 * u;
    ctx.beginPath();
    ctx.moveTo(-2 * u, -9 * u);
    ctx.quadraticCurveTo(-24 * u, flutter, -16 * u, 12 * u);
    ctx.quadraticCurveTo(-6 * u, 5 * u, -1 * u, 11 * u);
    ctx.closePath();
    ctx.fillStyle = "#6a2c1c";
    ctx.fill();
    ctx.strokeStyle = "rgba(228, 177, 90, 0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(1 * u, 0, 10 * u, 12.5 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1c1411";
    ctx.fill();
    ctx.strokeStyle = "#e4b15a";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(2 * u, -1 * u, 6.5 * u, Math.PI * 0.85, Math.PI * 1.7);
    ctx.strokeStyle = "#f0d7a2";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "#ffbf5a";
    ctx.fillRect(5 * u, -2.2 * u, 6.5 * u, 2.5 * u);
    ctx.beginPath();
    ctx.arc(10 * u, -1 * u, 3.4 * u, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 170, 60, 0.35)";
    ctx.fill();
    const swing = p.swinging ? swingAngle(p.swingStep, Math.min(1, p.swingT), p.swingDir) : 0.42;
    ctx.save();
    ctx.rotate(swing);
    ctx.beginPath();
    ctx.moveTo(8 * u, 0);
    ctx.lineTo(30 * u, -1.4 * u);
    ctx.strokeStyle = "rgba(255, 186, 90, 0.35)";
    ctx.lineWidth = 5 * u;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8 * u, 0);
    ctx.lineTo(30 * u, -1.2 * u);
    ctx.strokeStyle = "#fff3d8";
    ctx.lineWidth = 2.3 * u;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8 * u, -4.2 * u);
    ctx.lineTo(8 * u, 4.2 * u);
    ctx.strokeStyle = "#e4b15a";
    ctx.lineWidth = 1.8 * u;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    const pct = Math.max(0, p.hp / p.maxHp);
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.playerRadius() + 7 * u, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.strokeStyle = pct <= 0.3 ? "#ff4d3a" : "rgba(228, 177, 90, 0.85)";
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    if (p.dashCd <= 0 && !p.dashing && (this.phase === "playing" || this.phase === "menu")) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.facing);
      ctx.strokeStyle = "rgba(214, 236, 255, 0.8)";
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.moveTo(-16 * u, -5 * u);
      ctx.lineTo(-22 * u, 0);
      ctx.lineTo(-16 * u, 5 * u);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawSwing(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    if (!p.swinging) return;
    const t = Math.min(1, p.swingT);
    const a1 = p.swingFacing + swingAngle(p.swingStep, t, p.swingDir);
    const a0 = p.swingFacing + swingAngle(p.swingStep, Math.max(0, t - 0.28), p.swingDir);
    const rad = (p.swingStep === 2 ? 76 : 54) * this.u;
    const start = Math.min(a0, a1);
    const end = Math.max(a0, a1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, start, end);
    ctx.strokeStyle = `rgba(255, 176, 80, ${0.4 * (1 - t)})`;
    ctx.lineWidth = (p.swingStep === 2 ? 24 : 15) * this.u;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, start, end);
    ctx.strokeStyle = `rgba(255, 246, 226, ${0.95 * (1 - t)})`;
    ctx.lineWidth = (p.swingStep === 2 ? 11 : 7) * this.u;
    ctx.stroke();
  }

  private drawBolts(ctx: CanvasRenderingContext2D) {
    for (const bolt of this.bolts) {
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffb15a";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bolt.x, bolt.y);
      ctx.lineTo(bolt.x - bolt.vx * 0.04, bolt.y - bolt.vy * 0.04);
      ctx.strokeStyle = "rgba(255, 210, 150, 0.7)";
      ctx.lineWidth = bolt.r;
      ctx.stroke();
    }
  }

  private drawGems(ctx: CanvasRenderingContext2D) {
    for (const gem of this.gems) {
      ctx.save();
      ctx.translate(gem.x, gem.y + Math.sin(this.anim * 4 + gem.x) * 3);
      ctx.rotate(this.anim * 2);
      ctx.fillStyle = "rgba(255, 196, 110, 0.25)";
      ctx.beginPath();
      ctx.arc(0, 0, 10 * this.u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd78a";
      ctx.fillRect(-4.5 * this.u, -4.5 * this.u, 9 * this.u, 9 * this.u);
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.max);
      if (particle.streak) {
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 0.02, particle.y - particle.vy * 0.02);
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = particle.size;
        ctx.stroke();
      } else {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawRingFx(ctx: CanvasRenderingContext2D) {
    for (const ring of this.rings) {
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = Math.max(0, ring.life / ring.max);
      ctx.lineWidth = ring.width;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawNova(ctx: CanvasRenderingContext2D) {
    if (this.novaT <= 0 && !this.novaHit) return;
    if (this.novaT <= 0) return;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, Math.max(4, this.novaR), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 236, 200, ${0.35 + this.novaT})`;
    ctx.lineWidth = 16 * this.u;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, Math.max(4, this.novaR * 0.72), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 140, 50, ${0.25 + this.novaT * 0.4})`;
    ctx.lineWidth = 8 * this.u;
    ctx.stroke();
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const floater of this.floaters) {
      ctx.globalAlpha = Math.max(0, floater.life / floater.max);
      ctx.font = `700 ${Math.max(11, floater.size)}px Outfit, sans-serif`;
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawBanner(ctx: CanvasRenderingContext2D) {
    if (this.bannerT <= 0 || this.phase === "menu") return;
    const alpha = this.bannerT > 1.2 ? (1.65 - this.bannerT) / 0.45 : Math.min(1, this.bannerT / 0.35);
    let y = this.arena.y - this.arena.r - 28;
    if (y < 78) y = this.arena.y - this.arena.r * 0.42;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.max(22, 34 * this.u)}px Cinzel, Palatino, serif`;
    ctx.fillStyle = "#fff1d4";
    ctx.fillText(this.banner, this.arena.x, y);
    ctx.font = `600 ${Math.max(10, 12 * this.u)}px Outfit, sans-serif`;
    ctx.fillStyle = "#e4b15a";
    ctx.fillText(this.bannerSub, this.arena.x, y + 22 * Math.max(1, this.u));
    ctx.restore();
  }

  private drawGuide(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "playing" || this.didSwing || this.showGuide <= 0) return;
    const enemy = this.enemies[0];
    if (!enemy || enemy.dead) return;
    const pulse = 0.45 + Math.sin(this.anim * 7) * 0.35;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, this.er(enemy) + 8 * this.u, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 214, 150, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `600 ${Math.max(11, 12 * this.u)}px Outfit, sans-serif`;
    ctx.fillStyle = "rgba(255, 226, 180, 0.9)";
    ctx.textAlign = "center";
    ctx.fillText("SLASH", enemy.x, enemy.y - this.er(enemy) - 14 * this.u);
  }

  private drawVignette(ctx: CanvasRenderingContext2D) {
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.28, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    if (this.player.hp > 0 && this.player.hp / this.player.maxHp <= 0.3 && (this.phase === "playing" || this.phase === "paused")) {
      const a = 0.12 + Math.sin(this.anim * 5) * 0.06;
      const low = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.2, this.w / 2, this.h * 0.7, Math.max(this.w, this.h) * 0.7);
      low.addColorStop(0, "rgba(80,0,0,0)");
      low.addColorStop(1, `rgba(120, 0, 0, ${a})`);
      ctx.fillStyle = low;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (this.hurtFlash > 0.02) {
      ctx.fillStyle = `rgba(120, 8, 0, ${this.hurtFlash * 0.38})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (this.flash > 0.02) {
      ctx.fillStyle = `rgba(255, 236, 210, ${this.flash * 0.32})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private drawReticle(ctx: CanvasRenderingContext2D) {
    if (!this.mouseAim || this.phase !== "playing") return;
    ctx.save();
    ctx.translate(this.mouseX, this.mouseY);
    ctx.strokeStyle = "rgba(255, 220, 170, 0.9)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0.4, Math.PI * 2 - 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(-6, 0);
    ctx.moveTo(6, 0);
    ctx.lineTo(13, 0);
    ctx.moveTo(0, -13);
    ctx.lineTo(0, -6);
    ctx.moveTo(0, 6);
    ctx.lineTo(0, 13);
    ctx.stroke();
    ctx.restore();
  }

  private toWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? ((clientX - rect.left) / rect.width) * this.w : 0;
    const sy = rect.height > 0 ? ((clientY - rect.top) / rect.height) * this.h : 0;
    const z = this.zoom || 1;
    return {
      x: (sx - this.arena.x - this.shakeX) / z + this.arena.x,
      y: (sy - this.arena.y - this.shakeY) / z + this.arena.y,
    };
  }

  private emitHud(force = false) {
    const p = this.player;
    const snap: Hud = {
      score: this.score,
      combo: this.combo,
      mult: comboMult(this.combo),
      title: comboTitle(this.combo),
      battle: Math.max(1, this.battle),
      hp: Math.max(0, p.hp),
      maxHp: p.maxHp,
      heat: this.heat,
      novaReady: this.heat >= 100,
      dashPct: p.dashCd <= 0 ? 1 : 1 - p.dashCd / DASH_CD,
      kills: this.kills,
      time: this.runTime,
      bestCombo: this.bestCombo,
      low: p.hp > 0 && p.hp / p.maxHp <= 0.3,
      hint: this.phase === "playing" && this.runTime < 9,
    };
    const key = [
      snap.score,
      snap.combo,
      snap.battle,
      Math.round(snap.hp),
      Math.round(snap.heat),
      snap.novaReady ? 1 : 0,
      Math.floor(snap.time),
      Math.floor(snap.dashPct * 12),
      snap.low ? 1 : 0,
      snap.hint ? 1 : 0,
      snap.kills,
    ].join("|");
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    this.hooks.onHud(snap);
  }
}

function swingAngle(step: number, t: number, dir: number) {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - clamped) ** 3;
  if (step === 2) return -2.5 + eased * 5;
  const from = dir > 0 ? -1.2 : 1.2;
  const to = dir > 0 ? 1.25 : -1.25;
  return from + (to - from) * eased;
}

function toRoman(num: number) {
  const pairs: [number, string][] = [
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let n = Math.max(1, Math.min(199, Math.floor(num)));
  let out = "";
  for (const [value, symbol] of pairs) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

function battleSub(n: number) {
  if (n === 1) return "STRIKE FIRST";
  if (n === 2) return "HOUNDS IN THE RIFT";
  if (n === 3) return "WISPS TAKE AIM";
  if (n === 4) return "BRUTES CROSS";
  if (n === 5) return "A MOONBRAND RISES";
  if (n % 5 === 0) return "THE RIFT DEEPENS";
  return "HOLD THE RING";
}

function compose(battle: number): Kind[] {
  const out: Kind[] = [];
  const cinders = Math.min(9, 5 + Math.floor(battle * 0.45));
  for (let i = 0; i < cinders; i++) out.push("cinder");
  if (battle >= 2) {
    const n = Math.min(4, 1 + Math.floor((battle - 1) / 2));
    for (let i = 0; i < n; i++) out.push("hound");
  }
  if (battle >= 3) {
    const n = Math.min(4, Math.floor(battle / 2));
    for (let i = 0; i < n; i++) out.push("wisp");
  }
  if (battle >= 4) {
    const n = Math.min(3, Math.floor((battle - 1) / 3));
    for (let i = 0; i < n; i++) out.push("brute");
  }
  if (battle >= 5 && (battle % 2 === 1 || battle % 5 === 0)) out.push("elite");
  return out;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
