// Public endpoint — no auth required (used by the entry form)
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const tournament = await prisma.majorsTournament.findUnique({
    where: { id: params.id },
    include: {
      golfers: { orderBy: [{ tier: "asc" }, { odds: "asc" }] },
      entries: {
        include: {
          picks: { include: { golfer: true }, orderBy: { tier: "asc" } },
          winnerPick: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    tournament: {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      year: tournament.year,
      status: tournament.status,
      golfers: tournament.golfers,
      entryCount: tournament.entries.length,
      entries: tournament.entries,
    },
  })
}
