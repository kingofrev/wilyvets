import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface TrashInput {
  roundPlayerId: string;
  greenies?: number;
  sandies?: number;
  others?: number;
}

// Counters can't go negative, and nobody is making a hundred birdies
function clamp(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(99, Math.max(0, Math.round(value)));
}

// POST — save the manually tallied trash for one or more players.
// Birdies aren't here: they're counted from the scorecard.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { tallies } = (await request.json()) as { tallies: TrashInput[] };

    if (!Array.isArray(tallies)) {
      return NextResponse.json({ error: "Invalid tallies" }, { status: 400 });
    }

    const round = await prisma.round.findUnique({
      where: { id },
      select: {
        status: true,
        createdById: true,
        players: { select: { id: true } },
      },
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    if (round.createdById !== session.user.id) {
      return NextResponse.json({ error: "Not your round" }, { status: 403 });
    }
    if (round.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Round is already completed" },
        { status: 400 }
      );
    }

    // Only accept players who are actually in this round
    const roundPlayerIds = new Set(round.players.map((p) => p.id));
    const accepted = tallies.filter((t) => roundPlayerIds.has(t.roundPlayerId));

    await prisma.$transaction(
      accepted.map((tally) => {
        const counts = {
          greenies: clamp(tally.greenies),
          sandies: clamp(tally.sandies),
          others: clamp(tally.others),
        };

        return prisma.trashTally.upsert({
          where: { roundPlayerId: tally.roundPlayerId },
          update: counts,
          create: { roundPlayerId: tally.roundPlayerId, ...counts },
        });
      })
    );

    return NextResponse.json({ success: true, saved: accepted.length });
  } catch (error) {
    console.error("Error saving trash:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
