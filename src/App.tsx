import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Engine, type Hud, type Phase, type RunStats } from "./game/engine";
import { formatTime, loadScores, qualifies, saveScore, type ScoreEntry } from "./game/scores";
import { cn } from "./utils/cn";

const EMPTY_HUD: Hud = {
  score: 0,
  combo: 0,
  mult: 1,
  title: "",
  battle: 1,
  hp: 100,
  maxHp: 100,
  heat: 0,
  novaReady: false,
  dashPct: 1,
  kills: 0,
  time: 0,
  bestCombo: 0,
  low: false,
  hint: false,
};

function epitaph(score: number) {
  if (score >= 8000) return "The forge still answers.";
  if (score >= 3500) return "The moon marked your name.";
  if (score >= 1200) return "A brief, bright watch.";
  return "The rift barely noticed.";
}

function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return value;
}

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M32 8l2.2 18 10 4.2-10 3.2L32 52l-2.2-18.6L18 30.2l12-4.2z" fill="#ff6a2c" />
    </svg>
  );
}

function Board({ scores, highlight }: { scores: ScoreEntry[]; highlight?: number | null }) {
  return (
    <ol className="space-y-1">
      {scores.length === 0 && <li className="py-3 text-sm text-ash">No oaths carved. The ring is waiting.</li>}
      {scores.map((entry, index) => (
        <li
          key={`${entry.name}-${entry.score}-${entry.time}-${index}`}
          title={`${formatTime(entry.time)} · chain ${entry.combo}`}
          className={cn(
            "grid grid-cols-[1.4rem_1fr_auto_auto] items-baseline gap-2 px-2 py-1.5 text-sm",
            highlight === index && "bg-gold/15 text-gold",
          )}
        >
          <span className="text-ash">{index + 1}</span>
          <span className="truncate font-display tracking-[0.12em]">{entry.name}</span>
          <span className="tabular-nums">{entry.score.toLocaleString()}</span>
          <span className="text-ash tabular-nums">B{entry.battle}</span>
        </li>
      ))}
    </ol>
  );
}

function Joystick({ onChange }: { onChange: (x: number, y: number, active: boolean) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.36;
    const mag = Math.hypot(dx, dy);
    if (mag > max && mag > 0) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    setKnob({ x: dx, y: dy });
    if (mag < 8) onChange(0, 0, true);
    else onChange(dx / max, dy / max, true);
  };

  const end = (id: number) => {
    if (pointer.current !== id) return;
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0, false);
  };

  return (
    <div
      ref={base}
      className="stick pointer-events-auto"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return;
        update(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => end(event.pointerId)}
      onPointerCancel={(event) => end(event.pointerId)}
      role="application"
      aria-label="Move"
    >
      <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function ActionButton({
  label,
  className,
  cd = 0,
  armed = false,
  onDown,
  onUp,
}: {
  label: string;
  className: string;
  cd?: number;
  armed?: boolean;
  onDown: () => void;
  onUp?: () => void;
}) {
  const press = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onDown();
  };
  return (
    <button
      type="button"
      className={cn("act-btn", className, armed && "armed")}
      aria-label={label}
      onPointerDown={press}
      onPointerUp={(event) => {
        event.preventDefault();
        onUp?.();
      }}
      onPointerCancel={() => onUp?.()}
    >
      <span>{label}</span>
      {cd > 0.02 && <i className="cd-veil" style={{ height: `${Math.min(100, cd * 100)}%` }} />}
    </button>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const scoresRef = useRef(scores);
  const statsRef = useRef(stats);
  const nameState = useRef(name);
  const savedRef = useRef(false);
  const prevPhase = useRef<Phase>("menu");
  scoresRef.current = scores;
  statsRef.current = stats;
  nameState.current = name;

  const commit = () => {
    const current = statsRef.current;
    if (!current || savedRef.current) return;
    if (!qualifies(scoresRef.current, current.score)) {
      savedRef.current = true;
      setSaved(true);
      return;
    }
    const entry: ScoreEntry = {
      name: (nameState.current.trim() || "WARDEN").slice(0, 10),
      score: current.score,
      battle: current.battle,
      combo: current.bestCombo,
      time: current.time,
    };
    const result = saveScore(scoresRef.current, entry);
    savedRef.current = true;
    setScores(result.scores);
    setSaved(true);
    setRank(result.rank);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, {
      onPhase: (next) => setPhase(next),
      onHud: (next) => setHud(next),
      onOver: (next) => {
        statsRef.current = next;
        savedRef.current = false;
        nameState.current = "";
        setSaved(false);
        setRank(null);
        setName("");
        setStats(next);
      },
      onMute: (next) => setMuted(next),
    });
    engineRef.current = engine;
    setMuted(engine.muted);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const prev = prevPhase.current;
    if (prev === "over" && phase !== "over") commit();
    if (prev === "dying" && (phase === "playing" || phase === "menu")) commit();
    prevPhase.current = phase;
  });

  useEffect(() => {
    if (phase !== "over") return;
    const timer = window.setTimeout(() => {
      if (stats && qualifies(scores, stats.score) && !saved) nameInput.current?.focus();
      else againRef.current?.focus();
    }, 280);
    return () => window.clearTimeout(timer);
  }, [phase, stats, scores, saved]);

  const best = scores[0]?.score ?? 0;
  const beating = best > 0 && hud.score > best;
  const inRun = phase === "playing" || phase === "paused" || phase === "dying";
  const shownScore = useCountUp(stats?.score ?? 0, phase === "over");
  const canCarve = Boolean(stats && qualifies(scores, stats.score) && !saved);

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Emberwake arena" />

      {inRun && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-[max(10px,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] tracking-[0.28em] text-gold/80">SCORE</div>
              <div className={cn("font-display text-3xl leading-none tabular-nums sm:text-4xl", beating ? "text-gold" : "text-paper")}>
                {hud.score.toLocaleString()}
              </div>
              <div className="mt-1 text-[10px] tracking-[0.18em] text-ash">
                {beating ? "NEW BEST" : `BEST ${best.toLocaleString()}`}
              </div>
              {hud.combo >= 2 && (
                <div key={hud.mult} className="combo-pop mt-1 flex items-baseline gap-2">
                  <span className="font-display text-xl text-gold">×{hud.mult}</span>
                  {hud.title && <span className="text-[10px] tracking-[0.2em] text-gold-2">{hud.title}</span>}
                  <span className="text-[10px] tracking-[0.14em] text-ash">{hud.combo} HITS</span>
                </div>
              )}
            </div>
            <div className="pt-1 text-center">
              <div className="text-[10px] tracking-[0.28em] text-ash">BATTLE</div>
              <div key={hud.battle} className="combo-pop font-display text-2xl text-gold-2">
                {hud.battle}
              </div>
            </div>
            <button
              type="button"
              className="icon-btn pointer-events-auto grid h-11 w-11 place-items-center"
              aria-label="Pause"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.blur();
                engineRef.current?.pause();
              }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" fill="currentColor" />
              </svg>
            </button>
          </div>
          <div className="mx-auto mt-2 w-full max-w-md">
            <div className="mb-1 flex justify-between text-[10px] tracking-[0.18em] text-ash">
              <span>VITAL {Math.ceil(hud.hp)}</span>
              <span className={cn(hud.novaReady && "text-gold")}>{hud.novaReady ? "E · NOVA READY" : "HEAT"}</span>
            </div>
            <div className="hp-track mb-1.5" aria-hidden="true">
              <div className={cn("hp-fill", hud.low && "low")} style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }} />
            </div>
            <div className="heat-track" aria-hidden="true">
              <div className={cn("heat-fill", hud.novaReady && "ready")} style={{ width: `${hud.heat}%` }} />
            </div>
          </div>
        </div>
      )}

      {hud.hint && phase === "playing" && (
        <div className="desktop-hint pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-center text-[11px] tracking-[0.22em] text-gold/85">
          SPACE SLASH · SHIFT DASH · E NOVA
        </div>
      )}

      {(phase === "playing" || phase === "paused" || phase === "dying") && (
        <div className="touch-ui">
          <Joystick onChange={(x, y, active) => engineRef.current?.setStick(x, y, active)} />
          <div className="pointer-events-auto mb-1 flex items-end gap-2">
            <div className="flex flex-col gap-2">
              <ActionButton
                label="Nova"
                className="nova"
                armed={hud.novaReady}
                onDown={() => engineRef.current?.pressUlt()}
              />
              <ActionButton
                label="Dash"
                className="dash"
                cd={1 - hud.dashPct}
                onDown={() => engineRef.current?.pressDash()}
              />
            </div>
            <ActionButton
              label="Slash"
              className="slash"
              onDown={() => engineRef.current?.setAttackTouch(true)}
              onUp={() => engineRef.current?.setAttackTouch(false)}
            />
          </div>
        </div>
      )}

      {phase === "menu" && (
        <div className="menu-scrim absolute inset-0 z-30 overflow-y-auto">
          <div className="flex h-full flex-col justify-end gap-5 p-5 pb-[max(20px,env(safe-area-inset-bottom))] md:flex-row md:items-end md:justify-between md:p-12 lg:p-16">
            <div className="max-w-xl rise-in">
              <div className="mb-4 flex items-center gap-3 text-gold">
                <Mark className="h-8 w-8" />
                <span className="text-[10px] tracking-[0.32em] text-ash">RING VII · MOONFORGE</span>
              </div>
              <p className="text-[11px] tracking-[0.42em] text-gold">MOONFORGE ARENA</p>
              <h1 className="title-glow mt-2 font-display text-[18vw] leading-[0.82] text-paper md:text-8xl lg:text-9xl">
                EMBER
                <br />
                WAKE
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-ash sm:text-base">
                Dash the lunges. Chain your steel. When the forge burns white, spend it.
              </p>
              <button type="button" className="forge-btn mt-6 h-14 w-full max-w-sm text-sm" onClick={() => engineRef.current?.play()}>
                Draw Steel
              </button>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] tracking-[0.14em] text-ash">
                <span>
                  <kbd className="keycap">WASD</kbd> MOVE
                </span>
                <span>
                  <kbd className="keycap">SPACE</kbd> SLASH
                </span>
                <span>
                  <kbd className="keycap">SHIFT</kbd> DASH
                </span>
                <span>
                  <kbd className="keycap">E</kbd> NOVA
                </span>
              </div>
              <p className="mt-2 text-[11px] text-ash/80">Touch: stick to move, buttons to strike. Mouse aims the blade.</p>
            </div>
            <aside className="tablet w-full max-w-md p-4 md:p-5">
              <div className="mb-3 flex items-end justify-between">
                <h2 className="font-display text-sm tracking-[0.22em] text-gold">THE RING REMEMBERS</h2>
                <span className="text-[10px] tracking-[0.16em] text-ash">{scores.length ? `BEST ${best.toLocaleString()}` : "UNCARVED"}</span>
              </div>
              <Board scores={scores.slice(0, 6)} />
            </aside>
          </div>
          <button
            type="button"
            className="icon-btn absolute right-4 top-[max(12px,env(safe-area-inset-top))] z-40 px-3 py-2"
            onClick={() => engineRef.current?.toggleMute()}
            aria-pressed={muted}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
        </div>
      )}

      {phase === "paused" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/55 p-5">
          <div className="tablet rise-in w-full max-w-md p-6 text-center">
            <p className="text-[10px] tracking-[0.32em] text-gold">STEEL STILLED</p>
            <h2 className="mt-2 font-display text-4xl text-paper">Hold.</h2>
            <p className="mt-2 text-sm text-ash">
              Battle {hud.battle} · {hud.score.toLocaleString()} · {hud.kills} fallen
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button type="button" className="forge-btn h-12 text-sm" onClick={() => engineRef.current?.resume()}>
                Resume
              </button>
              <button type="button" className="ghost-btn h-12 text-xs" onClick={() => engineRef.current?.play()}>
                Restart
              </button>
              <button type="button" className="ghost-btn h-12 text-xs" onClick={() => engineRef.current?.toMenu()}>
                Retreat
              </button>
            </div>
            <p className="mt-4 text-[10px] tracking-[0.16em] text-ash">ESC RESUME · R RESTART · M SOUND</p>
            <button type="button" className="icon-btn mt-3 px-3 py-2" onClick={() => engineRef.current?.toggleMute()}>
              {muted ? "Sound off" : "Sound on"}
            </button>
          </div>
        </div>
      )}

      {phase === "over" && stats && (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-black/62 p-5">
          <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center py-8">
            <div className="tablet rise-in p-6 sm:p-8" role="status">
              <p className="text-[10px] tracking-[0.32em] text-gold">THE FORGE COOLS</p>
              <h2 className="mt-2 font-display text-4xl text-paper sm:text-5xl">Your watch ends.</h2>
              <p className="mt-2 text-sm text-ash">{epitaph(stats.score)}</p>
              <div className="score-hero mt-5 font-display text-5xl text-gold sm:text-6xl">{shownScore.toLocaleString()}</div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["BATTLE", String(stats.battle)],
                  ["CHAIN", String(stats.bestCombo)],
                  ["FALLEN", String(stats.kills)],
                  ["TIME", formatTime(stats.time)],
                ].map(([label, value]) => (
                  <div key={label} className="border border-gold/20 px-2 py-2 text-center">
                    <div className="text-[10px] tracking-[0.18em] text-ash">{label}</div>
                    <div className="mt-1 font-display text-lg text-paper">{value}</div>
                  </div>
                ))}
              </div>
              {canCarve && (
                <form
                  className="mt-5 flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    commit();
                  }}
                >
                  <input
                    ref={nameInput}
                    value={name}
                    maxLength={10}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="WARDEN"
                    aria-label="Name for the high score table"
                    className="name-input h-12 flex-1 px-3 text-center text-sm outline-none"
                    onChange={(event) => setName(event.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 10))}
                  />
                  <button type="submit" className="ghost-btn h-12 px-4 text-xs">
                    Carve name
                  </button>
                </form>
              )}
              {saved && rank !== null && qualifies(scores, stats.score) && (
                <p className="mt-3 text-center text-xs tracking-[0.18em] text-gold">CARVED AT RANK {rank + 1}</p>
              )}
              <button
                ref={againRef}
                type="button"
                className="forge-btn mt-5 h-14 w-full text-sm"
                onClick={() => {
                  commit();
                  engineRef.current?.play();
                }}
              >
                Fight again
              </button>
              <button
                type="button"
                className="mt-3 w-full text-[11px] tracking-[0.2em] text-ash"
                onClick={() => {
                  commit();
                  engineRef.current?.toMenu();
                }}
              >
                RETURN TO THE GATE
              </button>
              <p className="mt-2 text-center text-[10px] tracking-[0.16em] text-ash">R FIGHTS AGAIN · ESC RETREATS</p>
            </div>
            <aside className="tablet mt-4 p-4">
              <h3 className="mb-2 font-display text-sm tracking-[0.2em] text-gold">REMEMBERED</h3>
              <Board scores={scores} highlight={saved ? rank : null} />
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
