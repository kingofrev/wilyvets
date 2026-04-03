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
