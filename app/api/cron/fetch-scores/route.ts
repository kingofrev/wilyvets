// Called by the Netlify scheduled function in netlify/functions/fetch-scores-cron.mts
// Secured by CRON_SECRET env var (set in Netlify environment variables)
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { recalculateStandings } from "@/lib/majors-standings"
import { fetchFromMasters, fetchFromESPN } from "@/lib/majors-fetch-scores"

export const maxDuration = 60

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tournaments = await prisma.majorsTournament.findMany({
    where: { status: "IN_PROGRESS" },
    include: { golfers: true },
  })

  if (tournaments.length === 0) {
    return NextResponse.json({ message: "No tournaments in progress", results: [] })
  }

  const results = []
  for (const tournament of tournaments) {
    try {
      let updated: number

      if (tournament.type === "MASTERS") {
        const result = await fetchFromMasters(tournament.year, tournament.golfers)
        updated = result.updated
      } else {
        const result = await fetchFromESPN(
          tournament.espnLeague || "pga",
          tournament.espnEventId,
          tournament.golfers,
        )
        updated = result.updated
      }

      await recalculateStandings(tournament.id)
      await prisma.majorsTournament.update({
        where: { id: tournament.id },
        data: { scoresUpdatedAt: new Date() },
      })

      results.push({ id: tournament.id, name: tournament.name, updated, total: tournament.golfers.length, success: true })
    } catch (err) {
      results.push({
        id: tournament.id,
        name: tournament.name,
        error: err instanceof Error ? err.message : "Failed",
        success: false,
      })
    }
  }

  return NextResponse.json({ results })
}
