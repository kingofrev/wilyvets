// ============================================================
// Majors Pool — Pure game logic (no DB calls)
// ============================================================

export interface GolferScore {
  id: string
  name: string
  tier: number
  odds: number
  r1Score: number | null
  r2Score: number | null
  r3Score: number | null
  r4Score: number | null
  totalScore: number | null
  isCut: boolean
  isWithdrawn: boolean
  position: string | null
}

export interface EntryPick {
  tier: number
  golferId: string
  golfer: GolferScore
  isDropped: boolean
}

export interface EntryResult {
  id: string
  entrantName: string
  email: string | null
  picks: EntryPick[]
  winnerPick: GolferScore | null
  tiebreaker: number | null
  effectiveScores: (number | null)[]  // One per pick (6 values)
  droppedIndices: number[]            // Indices of the 2 dropped picks
  totalScore: number | null
  rank: number | null
}

// Worst R3 / R4 among players who made the cut (used for missed-cut penalty)
export function getWorstScores(golfers: GolferScore[]): { worstR3: number; worstR4: number } {
  const madeCut = golfers.filter((g) => !g.isCut && !g.isWithdrawn)

  const r3s = madeCut.map((g) => g.r3Score).filter((s): s is number => s !== null)
  const r4s = madeCut.map((g) => g.r4Score).filter((s): s is number => s !== null)

  return {
    worstR3: r3s.length > 0 ? Math.max(...r3s) : 0,
    worstR4: r4s.length > 0 ? Math.max(...r4s) : 0,
  }
}

// Effective total score for a single golfer.
// Active players use totalScore (live cumulative from the API) so in-progress
// rounds are included. Missed-cut players use worst R3/R4 as a penalty.
export function getEffectiveTotalScore(
  golfer: GolferScore,
  worstR3: number,
  worstR4: number,
): number | null {
  if (golfer.isCut || golfer.isWithdrawn) {
    // Apply worst-round penalty for R3/R4
    const r1 = golfer.r1Score
    const r2 = golfer.r2Score
    if (r1 === null) return null
    if (r2 === null) return r1
    return r1 + r2 + worstR3 + worstR4
  }

  // For active golfers, totalScore is the live cumulative to-par (includes
  // any in-progress round). Fall back to summing completed rounds if not posted yet.
  if (golfer.totalScore !== null) return golfer.totalScore

  const r1 = golfer.r1Score
  if (r1 === null) return null
  const r2 = golfer.r2Score
  if (r2 === null) return r1
  return r1 + r2
}

// Calculate entry score: sum of the best 4 of 6 golfer effective totals.
export function calculateEntryScore(
  picks: GolferScore[],
  worstR3: number,
  worstR4: number,
): { effectiveScores: (number | null)[]; droppedIndices: number[]; total: number | null } {
  const effectiveScores = picks.map((g) => getEffectiveTotalScore(g, worstR3, worstR4))

  const scored = effectiveScores
    .map((score, index) => ({ score, index }))
    .filter((x): x is { score: number; index: number } => x.score !== null)

  if (scored.length < 4) {
    return { effectiveScores, droppedIndices: [], total: null }
  }

  // Sort ascending (lower = better in golf), keep best 4, drop 2 worst
  const sorted = [...scored].sort((a, b) => a.score - b.score)
  const kept = sorted.slice(0, 4)
  const dropped = sorted.slice(4)

  const droppedIndices = dropped.map((x) => x.index)
  const total = kept.reduce((sum, x) => sum + x.score, 0)

  return { effectiveScores, droppedIndices, total }
}

// Determine the actual tournament winner (lowest total, made cut)
export function getTournamentWinner(golfers: GolferScore[]): GolferScore | null {
  const active = golfers.filter((g) => !g.isCut && !g.isWithdrawn && g.totalScore !== null)
  if (active.length === 0) return null
  return active.reduce((best, g) => (g.totalScore! < best.totalScore! ? g : best))
}

// Rank entries: lowest totalScore wins; tiebreaker = closest to actual winning score
export function rankEntries(
  entries: { id: string; totalScore: number | null; tiebreaker: number | null }[],
  actualWinnerScore: number | null,
): Map<string, number> {
  const withScores = entries.filter((e) => e.totalScore !== null)

  withScores.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore! - b.totalScore!
    if (actualWinnerScore !== null) {
      const aDist = a.tiebreaker !== null ? Math.abs(a.tiebreaker - actualWinnerScore) : Infinity
      const bDist = b.tiebreaker !== null ? Math.abs(b.tiebreaker - actualWinnerScore) : Infinity
      return aDist - bDist
    }
    return 0
  })

  const ranks = new Map<string, number>()
  withScores.forEach((entry, i) => {
    ranks.set(entry.id, i + 1)
  })
  return ranks
}

// Format American odds for display: +1000, +2500 etc.
export function formatOdds(odds: number): string {
  return `+${odds}`
}

// Format score relative to par: -15 → "-15", 0 → "E", 3 → "+3"
export function formatScore(score: number | null): string {
  if (score === null) return "-"
  if (score === 0) return "E"
  return score > 0 ? `+${score}` : `${score}`
}

// Tier label for display
export function tierLabel(tier: number): string {
  const ranges: Record<number, string> = {
    1: "Tier 1 — Favorites (top 10)",
    2: "Tier 2 — Contenders (11–20)",
    3: "Tier 3 — Mid-field (21–30)",
    4: "Tier 4 — Longshots (31–40)",
    5: "Tier 5 — Dark Horses (41–50)",
    6: "Tier 6 — The Rest (51+)",
  }
  return ranges[tier] ?? `Tier ${tier}`
}
