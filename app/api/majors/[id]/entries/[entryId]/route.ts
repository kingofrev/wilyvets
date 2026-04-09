import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalculateStandings } from "@/lib/majors-standings"

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; entryId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id } })
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const entry = await prisma.majorsEntry.findUnique({ where: { id: params.entryId } })
  if (!entry || entry.tournamentId !== params.id) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 })
  }

  const body = await request.json()
  const { tiebreaker, winnerPickId, picks } = body

  // Validate picks if provided
  if (picks !== undefined) {
    if (!Array.isArray(picks) || picks.length !== 6) {
      return NextResponse.json({ error: "Exactly 6 picks required" }, { status: 400 })
    }
    const tiers = (picks as { tier: number }[]).map((p) => p.tier).sort()
    if (JSON.stringify(tiers) !== JSON.stringify([1, 2, 3, 4, 5, 6])) {
      return NextResponse.json({ error: "One pick required per tier (1–6)" }, { status: 400 })
    }
    const golferIds = (picks as { golferId: string }[]).map((p) => p.golferId)
    const golfers = await prisma.majorsGolfer.findMany({
      where: { id: { in: golferIds }, tournamentId: params.id },
    })
    if (golfers.length !== 6) {
      return NextResponse.json({ error: "One or more golfers not found" }, { status: 400 })
    }
    for (const pick of picks as { tier: number; golferId: string }[]) {
      const golfer = golfers.find((g) => g.id === pick.golferId)
      if (!golfer || golfer.tier !== pick.tier) {
        return NextResponse.json({ error: `Golfer is not in tier ${pick.tier}` }, { status: 400 })
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (picks !== undefined) {
      await tx.majorsPickGolfer.deleteMany({ where: { entryId: params.entryId } })
      await tx.majorsPickGolfer.createMany({
        data: (picks as { tier: number; golferId: string }[]).map((p) => ({
          entryId: params.entryId,
          golferId: p.golferId,
          tier: p.tier,
        })),
      })
    }
    await tx.majorsEntry.update({
      where: { id: params.entryId },
      data: {
        ...(tiebreaker !== undefined && {
          tiebreaker: tiebreaker !== null ? parseInt(tiebreaker) : null,
        }),
        ...(winnerPickId !== undefined && { winnerPickId: winnerPickId || null }),
      },
    })
  })

  await recalculateStandings(params.id)

  return NextResponse.json({ success: true })
}
