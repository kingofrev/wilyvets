import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Assigns tier 1–6 based on sorted position (10 per tier, tier 6 = rest)
function assignTier(index: number): number {
  if (index < 10) return 1
  if (index < 20) return 2
  if (index < 30) return 3
  if (index < 40) return 4
  if (index < 50) return 5
  return 6
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id } })
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "ODDS_API_KEY not configured in environment" }, { status: 500 })
  }

  const sportKey = tournament.oddsApiSportKey
  if (!sportKey) {
    return NextResponse.json({ error: "No odds API sport key set for this tournament" }, { status: 400 })
  }

  // Fetch from The Odds API
  const oddsUrl =
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/` +
    `?apiKey=${apiKey}&regions=us&markets=outrights&oddsFormat=american`

  const oddsRes = await fetch(oddsUrl)
  if (!oddsRes.ok) {
    const text = await oddsRes.text()
    return NextResponse.json(
      { error: `Odds API error ${oddsRes.status}: ${text}` },
      { status: 502 },
    )
  }

  const oddsData = await oddsRes.json()

  // Flatten all outcomes across bookmakers, prefer DraftKings then first available
  type Outcome = { name: string; price: number }
  let outcomes: Outcome[] = []

  for (const event of Array.isArray(oddsData) ? oddsData : [oddsData]) {
    const bookmakers: { key: string; markets: { key: string; outcomes: Outcome[] }[] }[] =
      event.bookmakers ?? []
    const dk = bookmakers.find((b) => b.key === "draftkings")
    const source = dk ?? bookmakers[0]
    if (!source) continue
    const market = source.markets.find((m) => m.key === "outrights")
    if (market) {
      outcomes = market.outcomes
      break
    }
  }

  if (outcomes.length === 0) {
    return NextResponse.json(
      { error: "No outright odds found for this sport key. Check that the tournament is upcoming." },
      { status: 404 },
    )
  }

  // Sort ascending by American odds (lowest = biggest favorite)
  outcomes.sort((a, b) => a.price - b.price)

  // Upsert golfers with tier assignments
  const upserts = outcomes.map((outcome, index) =>
    prisma.majorsGolfer.upsert({
      where: { tournamentId_name: { tournamentId: params.id, name: outcome.name } },
      update: { odds: outcome.price, tier: assignTier(index) },
      create: {
        tournamentId: params.id,
        name: outcome.name,
        odds: outcome.price,
        tier: assignTier(index),
      },
    }),
  )

  await prisma.$transaction(upserts)
  await prisma.majorsTournament.update({
    where: { id: params.id },
    data: { oddsUpdatedAt: new Date() },
  })

  return NextResponse.json({ count: outcomes.length, message: "Odds fetched and tiers assigned." })
}
