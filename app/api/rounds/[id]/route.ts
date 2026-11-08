import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const round = await prisma.round.findUnique({
      where: { id },
      include: {
        course: {
          include: {
            holes: {
              orderBy: { holeNumber: "asc" },
            },
          },
        },
        players: {
          include: {
            player: true,
            scores: {
              orderBy: { holeNumber: "asc" },
            },
          },
        },
        matches: {
          include: {
            player1: {
              include: {
                player: true,
                scores: {
                  orderBy: { holeNumber: "asc" },
                },
              },
            },
            player2: {
              include: {
                player: true,
                scores: {
                  orderBy: { holeNumber: "asc" },
                },
              },
            },
            results: true,
            presses: true,
          },
        },
      },
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    return NextResponse.json({ round });
  } catch (error) {
    console.error("Error fetching round:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE — remove a round and everything hanging off it.
// Settlement and Match->RoundPlayer have no cascade rule in the schema, so the
// children are removed explicitly, deepest first, inside one transaction
// rather than relying on the database to work out an order.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const round = await prisma.round.findUnique({
      where: { id },
      select: { id: true, status: true, createdById: true },
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    // Only the person who started the round can throw it away
    if (round.createdById !== session.user.id) {
      return NextResponse.json({ error: "Not your round" }, { status: 403 });
    }

    // Completed rounds have already been written into the lifetime
    // head-to-head records, and deleting the round would not take them back out
    if (round.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Completed rounds can't be deleted" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.settlement.deleteMany({ where: { roundId: id } }),
      prisma.press.deleteMany({ where: { match: { roundId: id } } }),
      prisma.matchResult.deleteMany({ where: { match: { roundId: id } } }),
      prisma.match.deleteMany({ where: { roundId: id } }),
      prisma.holeScore.deleteMany({ where: { roundPlayer: { roundId: id } } }),
      prisma.roundPlayer.deleteMany({ where: { roundId: id } }),
      prisma.round.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting round:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
