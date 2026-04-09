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

  const groups = await prisma.majorsGroup.findMany({
    where: { tournamentId: params.id },
    include: { _count: { select: { entries: true } } },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ groups })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id } })
  if (!tournament || tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { name } = body
  if (!name?.trim()) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 })
  }

  const group = await prisma.majorsGroup.create({
    data: { tournamentId: params.id, name: name.trim() },
    include: { _count: { select: { entries: true } } },
  })

  return NextResponse.json({ group })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id } })
  if (!tournament || tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get("groupId")
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 })

  const group = await prisma.majorsGroup.findUnique({ where: { id: groupId } })
  if (!group || group.tournamentId !== params.id) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 })
  }

  const body = await request.json()
  const { buyIn, sideBetAmount, payoutStructure } = body

  const VALID_BUY_INS = [10, 20, 40, 50, 75, 100]
  const VALID_SIDE_BETS = [5, 10, 20, 25, 50]

  if (buyIn !== undefined && buyIn !== null && !VALID_BUY_INS.includes(Number(buyIn))) {
    return NextResponse.json({ error: "Invalid buyIn" }, { status: 400 })
  }
  if (sideBetAmount !== undefined && sideBetAmount !== null && !VALID_SIDE_BETS.includes(Number(sideBetAmount))) {
    return NextResponse.json({ error: "Invalid sideBetAmount" }, { status: 400 })
  }
  if (
    payoutStructure !== undefined &&
    payoutStructure !== null &&
    !["WINNER_TAKE_ALL", "TOP_THREE"].includes(payoutStructure)
  ) {
    return NextResponse.json({ error: "Invalid payoutStructure" }, { status: 400 })
  }

  const updated = await prisma.majorsGroup.update({
    where: { id: groupId },
    data: {
      ...(buyIn !== undefined && { buyIn: buyIn !== null ? Number(buyIn) : null }),
      ...(sideBetAmount !== undefined && { sideBetAmount: sideBetAmount !== null ? Number(sideBetAmount) : null }),
      ...(payoutStructure !== undefined && { payoutStructure: payoutStructure ?? null }),
    },
    include: { _count: { select: { entries: true } } },
  })

  return NextResponse.json({ group: updated })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id } })
  if (!tournament || tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get("groupId")
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 })

  await prisma.majorsGroup.delete({ where: { id: groupId } })
  return NextResponse.json({ ok: true })
}
