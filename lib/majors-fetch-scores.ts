import { prisma } from "@/lib/prisma"

// ─── Shared score parser ───────────────────────────────────────────────────────

export function parseScore(val: string | number | undefined | null): number | null {
  if (val === undefined || val === null) return null
  const s = String(val).trim()
  if (s === "" || s === "-") return null
  if (s === "E") return 0
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

// ─── Masters.com ──────────────────────────────────────────────────────────────

const MASTERS_PAR = 72

interface MastersRound {
  total?: string | null
  roundStatus?: string
}

interface MastersPlayer {
  id: string
  first_name: string
  last_name: string
  pos: string
  status: string
  topar: string
  today: string
  thru: string
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

export async function fetchFromMasters(
  year: number,
  golfers: { id: string; name: string }[],
): Promise<{ updated: number }> {
  const url = `https://www.masters.com/en_US/scores/feeds/${year}/scores.json`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; WilyVets/1.0)" },
    cache: "no-store",
  })

  if (!res.ok) throw new Error(`Masters.com returned ${res.status}`)

  const json = await res.json()
  const players: MastersPlayer[] = json?.data?.player ?? []
  const currentRound = parseInt(json?.data?.currentRound ?? "1")

  if (players.length === 0)
    throw new Error("Masters.com data not available yet — tournament may not have started")

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
    const thru = player.thru === "F" ? "F" : player.thru ? player.thru : null

    await prisma.majorsGolfer.update({
      where: { id: golfer.id },
      data: { r1Score: r1, r2Score: r2, r3Score: r3, r4Score: r4, totalScore, position, thru, isCut, isWithdrawn },
    })
    updated++
  }

  return { updated }
}

// ─── ESPN ─────────────────────────────────────────────────────────────────────

interface ESPNCompetitor {
  id: string
  order?: number
  athlete?: { id: string; displayName: string }
  score?: string
  linescores?: { displayValue?: string }[]
  status?: { thru?: number; displayValue?: string }
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

export async function fetchFromESPN(
  espnLeague: string,
  espnEventId: string | null,
  golfers: { id: string; name: string; espnId: string | null }[],
): Promise<{ updated: number }> {
  const eventParam = espnEventId ? `?event=${espnEventId}` : ""
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/golf/${espnLeague}/scoreboard${eventParam}`

  const espnRes = await fetch(espnUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; WilyVets/1.0)" },
  })

  if (!espnRes.ok) throw new Error(`ESPN API error ${espnRes.status}`)

  const espnData = await espnRes.json()
  const competitors = extractCompetitors(espnData)
  if (competitors.length === 0) throw new Error("No competitor data found in ESPN response")

  const byName = new Map<string, ESPNCompetitor>()
  const byEspnId = new Map<string, ESPNCompetitor>()
  for (const c of competitors) {
    if (c.athlete?.displayName) byName.set(c.athlete.displayName.toLowerCase(), c)
    if (c.athlete?.id) byEspnId.set(c.athlete.id, c)
  }

  let updated = 0
  for (const golfer of golfers) {
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
    const thruNum = comp.status?.thru
    const thru = thruNum != null ? (thruNum === 18 ? "F" : String(thruNum)) : null

    await prisma.majorsGolfer.update({
      where: { id: golfer.id },
      data: { r1Score: r1, r2Score: r2, r3Score: r3, r4Score: r4, totalScore, position, thru, isCut, isWithdrawn },
    })
    updated++
  }

  return { updated }
}
