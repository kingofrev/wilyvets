import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { recalculateStandings } from "@/lib/majors-standings"

function parseScore(val: string | undefined | null): number | null {
  if (!val) return null
  const s = String(val).trim()
  if (s === "" || s === "-") return null
  if (s === "E") return 0
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

function extractCompetitors(data: unknown) {
  try {
    const d = data as Record<string, unknown>
    const events = (d.events ?? d.event) as unknown[]
    if (!Array.isArray(events) || events.length === 0) return []
    const event = events[0] as Record<string, unknown>
    const competitions = event.competitions as unknown[]
    if (!Array.isArray(competitions) || competitions.length === 0) return []
    const comp = competitions[0] as Record<string, unknown>
    return (comp.competitors as {
      order?: number
      athlete?: { id: string; displayName: string }
      score?: string
      linescores?: { displayValue?: string }[]
    }[]) ?? []
  } catch {
    return []
  }
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization")
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tournaments = await prisma.majorsTournament.findMany({
    where: { status: "IN_PROGRESS" },
    include: { golfers: true },
  })

  if (tournaments.length === 0) {
    return NextResponse.json({ message: "No active tournaments" })
  }

  const results: Record<string, { updated: number; total: number; error?: string }> = {}

  for (const tournament of tournaments) {
    try {
      const league = tournament.espnLeague || "pga"
      const eventParam = tournament.espnEventId ? `?event=${tournament.espnEventId}` : ""
      const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/golf/${league}/scoreboard${eventParam}`

      const espnRes = await fetch(espnUrl)
      if (!espnRes.ok) {
        results[tournament.id] = { updated: 0, total: 0, error: `ESPN ${espnRes.status}` }
        continue
      }

      const espnData = await espnRes.json()
      const competitors = extractCompetitors(espnData)
      if (competitors.length === 0) {
        results[tournament.id] = { updated: 0, total: 0, error: "No competitors found" }
        continue
      }

      const byName = new Map<string, typeof competitors[0]>()
      const byEspnId = new Map<string, typeof competitors[0]>()
      for (const c of competitors) {
        if (c.athlete?.displayName) byName.set(c.athlete.displayName.toLowerCase(), c)
        if (c.athlete?.id) byEspnId.set(c.athlete.id, c)
      }

      let updated = 0
      for (const golfer of tournament.golfers) {
        const comp =
          (golfer.espnId ? byEspnId.get(golfer.espnId) : undefined) ??
          byName.get(golfer.name.toLowerCase())
        if (!comp) continue

        const ls = comp.linescores ?? []
        const r1 = parseScore(ls[0]?.displayValue)
        const r2 = parseScore(ls[1]?.displayValue)
        const r3 = parseScore(ls[2]?.displayValue)
        const r4 = parseScore(ls[3]?.displayValue)
        const totalScore = parseScore(comp.score)

        const scoreStr = (comp.score ?? "").toUpperCase()
        const isCut = scoreStr === "CUT"
        const isWithdrawn = scoreStr === "WD"
        let position: string | null = comp.order != null ? String(comp.order) : null
        if (isCut) position = "CUT"
        if (isWithdrawn) position = "WD"

        await prisma.majorsGolfer.update({
          where: { id: golfer.id },
          data: { r1Score: r1, r2Score: r2, r3Score: r3, r4Score: r4, totalScore, position, isCut, isWithdrawn },
        })
        updated++
      }

      await recalculateStandings(tournament.id)
      await prisma.majorsTournament.update({
        where: { id: tournament.id },
        data: { scoresUpdatedAt: new Date() },
      })

      results[tournament.id] = { updated, total: tournament.golfers.length }
    } catch (err) {
      results[tournament.id] = { updated: 0, total: 0, error: String(err) }
    }
  }

  return NextResponse.json({ results })
}
