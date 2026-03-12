// Server-side utility for recalculating Majors standings (shared by fetch-scores and calculate routes)
import { prisma } from "@/lib/prisma"
import { calculateEntryScore, getWorstScores, rankEntries } from "@/lib/games/majors"

export async function recalculateStandings(tournamentId: string) {
  const tournament = await prisma.majorsTournament.findUnique({
    where: { id: tournamentId },
    include: {
      golfers: true,
      entries: {
        include: {
          picks: { include: { golfer: true }, orderBy: { tier: "asc" } },
        },
      },
    },
  })
  if (!tournament) return

  const { worstR3, worstR4 } = getWorstScores(
    tournament.golfers.map((g) => ({
      id: g.id,
      name: g.name,
      tier: g.tier,
      odds: g.odds,
      r1Score: g.r1Score,
      r2Score: g.r2Score,
      r3Score: g.r3Score,
      r4Score: g.r4Score,
      totalScore: g.totalScore,
      isCut: g.isCut,
      isWithdrawn: g.isWithdrawn,
      position: g.position,
    })),
  )

  const entryScores: { id: string; totalScore: number | null; tiebreaker: number | null }[] = []

  for (const entry of tournament.entries) {
    const pickedGolfers = entry.picks.map((p) => ({
      id: p.golfer.id,
      name: p.golfer.name,
      tier: p.golfer.tier,
      odds: p.golfer.odds,
      r1Score: p.golfer.r1Score,
      r2Score: p.golfer.r2Score,
      r3Score: p.golfer.r3Score,
      r4Score: p.golfer.r4Score,
      totalScore: p.golfer.totalScore,
      isCut: p.golfer.isCut,
      isWithdrawn: p.golfer.isWithdrawn,
      position: p.golfer.position,
    }))

    const { total, droppedIndices } = calculateEntryScore(pickedGolfers, worstR3, worstR4)

    // Update isDropped on each pick
    for (let i = 0; i < entry.picks.length; i++) {
      await prisma.majorsPickGolfer.update({
        where: { id: entry.picks[i].id },
        data: { isDropped: droppedIndices.includes(i) },
      })
    }

    await prisma.majorsEntry.update({
      where: { id: entry.id },
      data: { totalScore: total },
    })

    entryScores.push({ id: entry.id, totalScore: total, tiebreaker: entry.tiebreaker })
  }

  // Determine actual winner for tiebreaker resolution
  const winner = tournament.golfers
    .filter((g) => !g.isCut && !g.isWithdrawn && g.totalScore !== null)
    .sort((a, b) => a.totalScore! - b.totalScore!)[0]
  const winnerScore = winner?.totalScore ?? null

  const ranks = rankEntries(entryScores, winnerScore)
  await Promise.all(
    Array.from(ranks.entries()).map(([entryId, rank]) =>
      prisma.majorsEntry.update({ where: { id: entryId }, data: { rank } }),
    ),
  )
}
