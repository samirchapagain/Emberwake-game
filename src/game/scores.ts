export interface ScoreEntry {
  name: string;
  score: number;
  battle: number;
  combo: number;
  time: number;
}

const KEY = "emberwake.scores.v1";
export const MAX_SCORES = 8;

function valid(entry: unknown): entry is ScoreEntry {
  if (!entry || typeof entry !== "object") return false;
  const s = entry as ScoreEntry;
  return (
    typeof s.name === "string" &&
    typeof s.score === "number" &&
    Number.isFinite(s.score) &&
    typeof s.battle === "number" &&
    typeof s.combo === "number" &&
    typeof s.time === "number"
  );
}

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(valid)
      .sort((a, b) => b.score - a.score || b.battle - a.battle)
      .slice(0, MAX_SCORES);
  } catch {
    return [];
  }
}

export function qualifies(scores: ScoreEntry[], score: number): boolean {
  if (score <= 0) return false;
  if (scores.length < MAX_SCORES) return true;
  return score >= scores[scores.length - 1]!.score;
}

export function saveScore(
  scores: ScoreEntry[],
  entry: ScoreEntry,
): { scores: ScoreEntry[]; rank: number } {
  const next = [...scores, entry]
    .sort((a, b) => b.score - a.score || b.battle - a.battle || a.time - b.time)
    .slice(0, MAX_SCORES);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
  const rank = next.findIndex(
    (s) => s.name === entry.name && s.score === entry.score && s.battle === entry.battle && s.time === entry.time,
  );
  return { scores: next, rank: rank < 0 ? 0 : rank };
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}
