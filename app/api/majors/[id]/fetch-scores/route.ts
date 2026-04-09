import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalculateStandings } from "@/lib/majors-standings"
import { fetchFromMasters, fetchFromESPN } from "@/lib/majors-fetch-scores"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tournament = await prisma.majorsTournament.findUnique({
    where: { id: params.id },
    include: { golfers: true },
  })

  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (tournament.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    let updated: number

    if (tournament.type === "MASTERS") {
      const result = await fetchFromMasters(tournament.year, tournament.golfers)
      updated = result.updated
    } else {
      const result = await fetchFromESPN(
        tournament.espnLeague || "pga",
        tournament.espnEventId,
        tournament.golfers,
      )
      updated = result.updated
    }

    await recalculateStandings(params.id)
    await prisma.majorsTournament.update({
      where: { id: params.id },
      data: { scoresUpdatedAt: new Date() },
    })

    return NextResponse.json({ updated, total: tournament.golfers.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch scores" },
      { status: 502 },
    )
  }
}
