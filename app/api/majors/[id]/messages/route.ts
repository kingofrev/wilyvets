import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(request.url)
  const after = searchParams.get("after") // cursor: only fetch messages newer than this id

  const messages = await prisma.majorsMessage.findMany({
    where: {
      tournamentId: params.id,
      ...(after ? { createdAt: { gt: (await prisma.majorsMessage.findUnique({ where: { id: after } }))?.createdAt ?? new Date(0) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  })

  return NextResponse.json({ messages })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json()
  const { authorName, body: msgBody } = body

  if (!authorName?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })
  if (!msgBody?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })
  if (msgBody.trim().length > 500) return NextResponse.json({ error: "Message too long" }, { status: 400 })

  const tournament = await prisma.majorsTournament.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 })

  const message = await prisma.majorsMessage.create({
    data: {
      tournamentId: params.id,
      authorName: authorName.trim().slice(0, 50),
      body: msgBody.trim(),
    },
  })

  return NextResponse.json({ message })
}
