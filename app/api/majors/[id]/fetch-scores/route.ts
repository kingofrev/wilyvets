import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalculateStandings } from "@/lib/majors-standings"

interface ESPNCompetitor {
  id: string
  order?: number
  athlete?: { id: string; displayName: string }
  score?: string
  linescores?: { displayValue?: string }[]
  statistics?: { name: string; displayValue: string }[]
}

function parseScore(val: string | number | undefined | null): number | null {
  if (val === undefined || val === null) return null
  if (typeof val === "number") return isNaN(val) ? null : val
  const s = String(val).trim()
  if (s === "" || s === "-") return null
  if (s === "E") return 0
  const n = parseInt(s)
  return isNaN(n) ? null : n
}


function extractCompetitors(data: unknown): ESPNCompetitor[] {
  try {
    const d = data as Record<string, unknown>
    const events = (d.events ?? d.event) as unknown[]
    if (!Array.isArray(events) || events.length === 0) return []
    const event = events[0] as Record<string, unknown>
    const competitions = event.competitions as unknown[]
    if (!Array.isArray(competitions) || competitions.length === 0) return []
    const comp = competitions[0] as Record<string, unknown>
    return (comp.competitors as ESPNCompetitor[]) ?? []
  } catch {
    return []
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({
    where: { id: params.id },
    include: { golfers: true },
  })

  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Build ESPN URL
  const league = tournament.espnLeague || "pga"
  const eventParam = tournament.espnEventId ? `?event=${tournament.espnEventId}` : ""
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/golf/${league}/scoreboard${eventParam}`

  const espnRes = await fetch(espnUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; WilyVets/1.0)" },
  })

  if (!espnRes.ok) {
    return NextResponse.json(
      { error: `ESPN API error ${espnRes.status}. Check espnLeague/espnEventId settings.` },
      { status: 502 },
    )
  }

  const espnData = await espnRes.json()
  const competitors = extractCompetitors(espnData)

  if (competitors.length === 0) {
    return NextResponse.json(
      { error: "No competitor data found. Tournament may not have started yet." },
      { status: 404 },
    )
  }

  // Build lookup maps
  const byName = new Map<string, ESPNCompetitor>()
  const byEspnId = new Map<string, ESPNCompetitor>()
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

    // linescores: individual round scores to par (use displayValue, not value)
    const ls = comp.linescores ?? []
    const r1 = parseScore(ls[0]?.displayValue)
    const r2 = parseScore(ls[1]?.displayValue)
    const r3 = parseScore(ls[2]?.displayValue)
    const r4 = parseScore(ls[3]?.displayValue)
    // comp.score is a string like "-4", "E", "+2"
    const totalScore = parseScore(comp.score)

    // Position from leaderboard order; CUT/WD detection via score string
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

  await recalculateStandings(params.id)
  await prisma.majorsTournament.update({
    where: { id: params.id },
    data: { scoresUpdatedAt: new Date() },
  })

  return NextResponse.json({ updated, total: tournament.golfers.length })
}
