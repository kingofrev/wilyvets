// Public endpoint — no auth required (used by the entry form and public leaderboard)
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get("group")

  const tournament = await prisma.majorsTournament.findUnique({
    where: { id: params.id },
    include: {
      golfers: { orderBy: [{ tier: "asc" }, { odds: "asc" }] },
      entries: {
        where: groupId ? { groupId } : {},
        include: {
          picks: { include: { golfer: true }, orderBy: { tier: "asc" } },
          winnerPick: true,
        },
        orderBy: { rank: "asc" },
      },
    },
  })

  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // If a group was requested, fetch its name and settings
  let groupName: string | null = null
  let buyIn = tournament.buyIn
  let sideBetAmount = tournament.sideBetAmount
  let payoutStructure: string = tournament.payoutStructure
  if (groupId) {
    const group = await prisma.majorsGroup.findUnique({ where: { id: groupId } })
    groupName = group?.name ?? null
    // Override with group-level settings where set
    if (group?.buyIn != null) buyIn = group.buyIn
    if (group?.sideBetAmount != null) sideBetAmount = group.sideBetAmount
    if (group?.payoutStructure != null) payoutStructure = group.payoutStructure
  }

  return NextResponse.json({
    tournament: {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      year: tournament.year,
      status: tournament.status,
      buyIn,
      sideBetAmount,
      payoutStructure,
      golfers: tournament.golfers,
      entryCount: tournament.entries.length,
      entries: tournament.entries,
      groupId: groupId ?? null,
      groupName,
    },
  })
}
