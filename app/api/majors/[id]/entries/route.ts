import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id } })
  if (!tournament || tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const entries = await prisma.majorsEntry.findMany({
    where: { tournamentId: params.id },
    include: {
      picks: { include: { golfer: true }, orderBy: { tier: "asc" } },
      winnerPick: true,
    },
    orderBy: { rank: "asc" },
  })

  return NextResponse.json({ entries })
}

// POST — no auth required (public entry form)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json()
  const { entrantName, email, picks, winnerPickId, tiebreaker } = body

  if (!entrantName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // picks: [{ tier: 1, golferId: "..." }, ...]
  if (!Array.isArray(picks) || picks.length !== 6) {
    return NextResponse.json({ error: "You must pick exactly one golfer from each of the 6 tiers" }, { status: 400 })
  }

  const tiers = picks.map((p: { tier: number }) => p.tier).sort()
  if (JSON.stringify(tiers) !== JSON.stringify([1, 2, 3, 4, 5, 6])) {
    return NextResponse.json({ error: "One pick required per tier (tiers 1–6)" }, { status: 400 })
  }

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id } })
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 })
  if (tournament.status === "COMPLETED") {
    return NextResponse.json({ error: "This tournament has ended — picks are closed" }, { status: 400 })
  }

  // Check for duplicate email
  if (email) {
    const existing = await prisma.majorsEntry.findUnique({
      where: { tournamentId_email: { tournamentId: params.id, email } },
    })
    if (existing) {
      return NextResponse.json({ error: "An entry with this email already exists" }, { status: 400 })
    }
  }

  // Verify golfer IDs belong to this tournament
  const golferIds = picks.map((p: { golferId: string }) => p.golferId)
  const golfers = await prisma.majorsGolfer.findMany({
    where: { id: { in: golferIds }, tournamentId: params.id },
  })
  if (golfers.length !== 6) {
    return NextResponse.json({ error: "One or more selected golfers not found" }, { status: 400 })
  }

  // Verify each pick is from the correct tier
  for (const pick of picks as { tier: number; golferId: string }[]) {
    const golfer = golfers.find((g) => g.id === pick.golferId)
    if (!golfer || golfer.tier !== pick.tier) {
      return NextResponse.json(
        { error: `Golfer is not in tier ${pick.tier}` },
        { status: 400 },
      )
    }
  }

  const session = await getServerSession(authOptions)

  const entry = await prisma.majorsEntry.create({
    data: {
      tournamentId: params.id,
      entrantName,
      email: email || null,
      userId: session?.user?.id ?? null,
      winnerPickId: winnerPickId || null,
      tiebreaker: tiebreaker !== undefined && tiebreaker !== null ? parseInt(tiebreaker) : null,
      picks: {
        create: (picks as { tier: number; golferId: string }[]).map((p) => ({
          golferId: p.golferId,
          tier: p.tier,
        })),
      },
    },
    include: {
      picks: { include: { golfer: true } },
      winnerPick: true,
    },
  })

  return NextResponse.json({ entry })
}
