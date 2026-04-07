import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({
    where: { id: params.id },
    include: {
      golfers: { orderBy: [{ tier: "asc" }, { odds: "asc" }] },
      entries: {
        include: {
          picks: { include: { golfer: true } },
          winnerPick: true,
        },
        orderBy: { rank: "asc" },
      },
    },
  })

  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json({ tournament })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id } })
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { status, espnEventId, espnLeague, oddsApiSportKey, buyIn, sideBetAmount, payoutStructure } = body

  const VALID_BUY_INS = [10, 20, 40, 50, 75, 100]
  const VALID_SIDE_BETS = [5, 10, 20, 25, 50]
  const VALID_PAYOUTS = ["WINNER_TAKE_ALL", "TOP_THREE"]

  if (buyIn !== undefined && !VALID_BUY_INS.includes(parseInt(buyIn))) {
    return NextResponse.json({ error: "Invalid buy-in amount" }, { status: 400 })
  }
  if (sideBetAmount !== undefined && !VALID_SIDE_BETS.includes(parseInt(sideBetAmount))) {
    return NextResponse.json({ error: "Invalid side bet amount" }, { status: 400 })
  }
  if (payoutStructure !== undefined && !VALID_PAYOUTS.includes(payoutStructure)) {
    return NextResponse.json({ error: "Invalid payout structure" }, { status: 400 })
  }

  const updated = await prisma.majorsTournament.update({
    where: { id: params.id },
    data: {
      ...(status && { status }),
      ...(espnEventId !== undefined && { espnEventId }),
      ...(espnLeague !== undefined && { espnLeague }),
      ...(oddsApiSportKey !== undefined && { oddsApiSportKey }),
      ...(buyIn !== undefined && { buyIn: parseInt(buyIn) }),
      ...(sideBetAmount !== undefined && { sideBetAmount: parseInt(sideBetAmount) }),
      ...(payoutStructure !== undefined && { payoutStructure }),
    },
  })

  return NextResponse.json({ tournament: updated })
}
