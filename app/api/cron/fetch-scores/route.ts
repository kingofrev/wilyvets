import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { recalculateStandings } from "@/lib/majors-standings"

// ─── Shared score parser ──────────────────────────────────────────────────────

function parseScore(val: string | undefined | null): number | null {
  if (!val) return null
  const s = String(val).trim()
  if (s === "" || s === "-") return null
  if (s === "E") return 0
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

// ─── Masters.com ─────────────────────────────────────────────────────────────

const MASTERS_PAR = 72

interface MastersRound {
  total?: string | null
  roundStatus?: string   // "Finished" when complete
}

interface MastersPlayer {
  first_name: string
  last_name: string
  pos: string
  status: string
  topar: string
  today: string    // current round score to par (live, in progress)
  thru: string     // holes completed today: "F" = finished, "9" = thru 9, "" = not started
  round1?: MastersRound
  round2?: MastersRound
  round3?: MastersRound
  round4?: MastersRound
}

function mastersRoundScore(
  round: MastersRound | undefined,
  todayStr: string,
  isCurrentRound: boolean,
): number | null {
  if (round?.roundStatus === "Finished" && round.total) {
    const n = parseInt(round.total)
    if (isNaN(n) || n < 55 || n > 100) return null
    return n - MASTERS_PAR
  }
  if (isCurrentRound) return parseScore(todayStr)
  return null
}

async function fetchFromMasters(
  year: number,
  golfers: { id: string; name: string }[],
): Promise<{ updated: number; error?: string }> {
  try {
    const url = `https://www.masters.com/en_US/scores/feeds/${year}/scores.json`
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WilyVets/1.0)" },
      cache: "no-store",
    })
    if (!res.ok) return { updated: 0, error: `Masters.com ${res.status}` }

    const json = await res.json()
    const players: MastersPlayer[] = json?.data?.player ?? []
    const currentRound = parseInt(json?.data?.currentRound ?? "1")
    if (players.length === 0) return { updated: 0, error: "Masters.com data not available yet" }

    const byName = new Map<string, MastersPlayer>()
    for (const p of players) {
      byName.set(`${p.first_name} ${p.last_name}`.toLowerCase().trim(), p)
      byName.set(`${p.last_name}, ${p.first_name}`.toLowerCase().trim(), p)
    }

    let updated = 0
    for (const golfer of golfers) {
      const player = byName.get(golfer.name.toLowerCase().trim())
      if (!player) continue

      const r1 = mastersRoundScore(player.round1, player.today, currentRound === 1)
      const r2 = mastersRoundScore(player.round2, player.today, currentRound === 2)
      const r3 = mastersRoundScore(player.round3, player.today, currentRound === 3)
      const r4 = mastersRoundScore(player.round4, player.today, currentRound === 4)
      const totalScore = parseScore(player.topar)
      const isCut = player.status === "-1" || player.pos === "MC"
      const isWithdrawn = player.status === "W" || player.pos === "WD"
      const position = player.pos || null

      await prisma.majorsGolfer.update({
        where: { id: golfer.id },
        data: { r1Score: r1, r2Score: r2, r3Score: r3, r4Score: r4, totalScore, position, isCut, isWithdrawn },
      })
      updated++
    }

    return { updated }
  } catch (err) {
    return { updated: 0, error: String(err) }
  }
}

// ─── ESPN ─────────────────────────────────────────────────────────────────────

async function fetchFromESPN(
  espnLeague: string,
  espnEventId: string | null,
  golfers: { id: string; name: string; espnId: string | null }[],
): Promise<{ updated: number; error?: string }> {
  try {
    const eventParam = espnEventId ? `?event=${espnEventId}` : ""
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/golf/${espnLeague}/scoreboard${eventParam}`

    const espnRes = await fetch(espnUrl)
    if (!espnRes.ok) return { updated: 0, error: `ESPN ${espnRes.status}` }

    const d = await espnRes.json() as Record<string, unknown>
    const events = (d.events ?? d.event) as unknown[]
    if (!Array.isArray(events) || events.length === 0) return { updated: 0, error: "No events in ESPN response" }
    const event = events[0] as Record<string, unknown>
    const competitions = event.competitions as unknown[]
    if (!Array.isArray(competitions) || competitions.length === 0) return { updated: 0, error: "No competitions found" }
    const comp = competitions[0] as Record<string, unknown>
    const competitors = (comp.competitors as {
      order?: number
      athlete?: { id: string; displayName: string }
      score?: string
      linescores?: { displayValue?: string }[]
    }[]) ?? []

    if (competitors.length === 0) return { updated: 0, error: "No competitors found" }

    const byName = new Map<string, typeof competitors[0]>()
    const byEspnId = new Map<string, typeof competitors[0]>()
    for (const c of competitors) {
      if (c.athlete?.displayName) byName.set(c.athlete.displayName.toLowerCase(), c)
      if (c.athlete?.id) byEspnId.set(c.athlete.id, c)
    }

    let updated = 0
    for (const golfer of golfers) {
      const c =
        (golfer.espnId ? byEspnId.get(golfer.espnId) : undefined) ??
        byName.get(golfer.name.toLowerCase())
      if (!c) continue

      const ls = c.linescores ?? []
      const r1 = parseScore(ls[0]?.displayValue)
      const r2 = parseScore(ls[1]?.displayValue)
      const r3 = parseScore(ls[2]?.displayValue)
      const r4 = parseScore(ls[3]?.displayValue)
      const totalScore = parseScore(c.score)

      const scoreStr = (c.score ?? "").toUpperCase()
      const isCut = scoreStr === "CUT"
      const isWithdrawn = scoreStr === "WD"
      let position: string | null = c.order != null ? String(c.order) : null
      if (isCut) position = "CUT"
      if (isWithdrawn) position = "WD"

      await prisma.majorsGolfer.update({
        where: { id: golfer.id },
        data: { r1Score: r1, r2Score: r2, r3Score: r3, r4Score: r4, totalScore, position, isCut, isWithdrawn },
      })
      updated++
    }

    return { updated }
  } catch (err) {
    return { updated: 0, error: String(err) }
  }
}

// ─── Cron handler ─────────────────────────────────────────────────────────────

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
    let result: { updated: number; error?: string }

    if (tournament.type === "MASTERS") {
      result = await fetchFromMasters(tournament.year, tournament.golfers)
    } else {
      result = await fetchFromESPN(
        tournament.espnLeague || "pga",
        tournament.espnEventId,
        tournament.golfers,
      )
    }

    if (!result.error) {
      await recalculateStandings(tournament.id)
      await prisma.majorsTournament.update({
        where: { id: tournament.id },
        data: { scoresUpdatedAt: new Date() },
      })
    }

    results[tournament.id] = { ...result, total: tournament.golfers.length }
  }

  return NextResponse.json({ results })
}
