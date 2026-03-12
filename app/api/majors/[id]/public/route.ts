// Public endpoint — no auth required (used by the entry form)
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const tournament = await prisma.majorsTournament.findUnique({
    where: { id: params.id },
    include: {
      golfers: { orderBy: [{ tier: "asc" }, { odds: "asc" }] },
      _count: { select: { entries: true } },
    },
  })

  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Don't expose entry details to the public view
  return NextResponse.json({
    tournament: {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      year: tournament.year,
      status: tournament.status,
      golfers: tournament.golfers,
      entryCount: tournament._count.entries,
    },
  })
}
