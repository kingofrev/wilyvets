import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MajorsTournamentType, MajorsPayoutStructure } from "@prisma/client"

const DEFAULT_ODDS_KEYS: Record<MajorsTournamentType, string> = {
  PLAYERS_CHAMPIONSHIP: "", // Not available on The Odds API — seed manually
  MASTERS: "golf_masters_tournament_winner",
  PGA_CHAMPIONSHIP: "golf_pga_championship_winner",
  US_OPEN: "golf_us_open_winner",
  THE_OPEN: "golf_the_open_championship_winner",
}

const DEFAULT_ESPN_LEAGUES: Record<MajorsTournamentType, string> = {
  PLAYERS_CHAMPIONSHIP: "pga",
  MASTERS: "masters",
  PGA_CHAMPIONSHIP: "pga",
  US_OPEN: "pga",
  THE_OPEN: "pga",
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournaments = await prisma.majorsTournament.findMany({
    where: { createdById: session.user.id },
    include: {
      _count: { select: { entries: true, golfers: true } },
    },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  })

  return NextResponse.json({ tournaments })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { name, type, year, espnEventId, buyIn, sideBetAmount, payoutStructure } = body

  if (!name || !type || !year) {
    return NextResponse.json({ error: "name, type and year are required" }, { status: 400 })
  }

  const VALID_BUY_INS = [10, 20, 40, 50, 75, 100]
  const VALID_SIDE_BETS = [5, 10, 20, 25, 50]
  const parsedBuyIn = buyIn ? parseInt(buyIn) : 10
  const parsedSideBet = sideBetAmount ? parseInt(sideBetAmount) : 20
  if (!VALID_BUY_INS.includes(parsedBuyIn)) {
    return NextResponse.json({ error: "Invalid buy-in amount" }, { status: 400 })
  }
  if (!VALID_SIDE_BETS.includes(parsedSideBet)) {
    return NextResponse.json({ error: "Invalid side bet amount" }, { status: 400 })
  }

  const tournamentType = type as MajorsTournamentType
  const validPayouts: MajorsPayoutStructure[] = ["WINNER_TAKE_ALL", "TOP_THREE"]
  const parsedPayout: MajorsPayoutStructure = validPayouts.includes(payoutStructure)
    ? payoutStructure
    : "WINNER_TAKE_ALL"

  const tournament = await prisma.majorsTournament.create({
    data: {
      name,
      type: tournamentType,
      year: parseInt(year),
      buyIn: parsedBuyIn,
      sideBetAmount: parsedSideBet,
      payoutStructure: parsedPayout,
      espnLeague: DEFAULT_ESPN_LEAGUES[tournamentType],
      espnEventId: espnEventId || null,
      oddsApiSportKey: DEFAULT_ODDS_KEYS[tournamentType],
      createdById: session.user.id,
    },
  })

  return NextResponse.json({ tournament })
}
