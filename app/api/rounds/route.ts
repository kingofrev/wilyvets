import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMatchPairings } from "@/lib/utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rounds = await prisma.round.findMany({
      where: { createdById: session.user.id },
      include: {
        course: true,
        players: true,
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ rounds });
  } catch (error) {
    console.error("Error fetching rounds:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId, betAmount, handicapMode, autoPressAt2, players } = await request.json();

    if (!courseId || !players || players.length < 2) {
      return NextResponse.json(
        { error: "Course and at least 2 players are required" },
        { status: 400 }
      );
    }

    // Get course with holes for handicap calculations
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { holes: true },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Calculate strokes given based on handicap mode
    const playerHandicaps = players.map((p: any) => parseFloat(p.handicap) || 0);
    const lowestInGroup = Math.min(...playerHandicaps);

    // Create round with players
    const round = await prisma.round.create({
      data: {
        createdById: session.user.id,
        courseId,
        betAmount: parseFloat(betAmount) || 5,
        handicapMode: handicapMode || "GROUP_LOWEST",
        autoPressAt2: autoPressAt2 || false,
        status: "IN_PROGRESS",
        players: {
          create: players.map((p: any) => {
            const handicap = parseFloat(p.handicap) || 0;
            const strokesGiven = handicapMode === "GROUP_LOWEST"
              ? Math.round(handicap - lowestInGroup)
              : 0; // Will be calculated per-match for MATCH_LOWEST

            return {
              userId: p.userId || null,
              playerId: p.playerId || null,
              handicap,
              playerName: p.name,
              strokesGiven,
            };
          }),
        },
      },
      include: {
        players: true,
        course: true,
      },
    });

    // Create matches for all player pairings
    const pairings = generateMatchPairings(round.players);

    for (const [p1, p2] of pairings) {
      const p1Handicap = Number(p1.handicap);
      const p2Handicap = Number(p2.handicap);

      // Calculate stroke difference for this match
      let strokeDiff: number;
      if (handicapMode === "MATCH_LOWEST") {
        const lowestInMatch = Math.min(p1Handicap, p2Handicap);
        strokeDiff = Math.round(p2Handicap - lowestInMatch) - Math.round(p1Handicap - lowestInMatch);
      } else {
        strokeDiff = Math.round(p2Handicap - lowestInGroup) - Math.round(p1Handicap - lowestInGroup);
      }

      await prisma.match.create({
        data: {
          roundId: round.id,
          player1Id: p1.id,
          player2Id: p2.id,
          strokeDifference: strokeDiff,
          results: {
            create: [
              { segment: "FRONT_9", holesRemaining: 9 },
              { segment: "BACK_9", holesRemaining: 9 },
              { segment: "OVERALL_18", holesRemaining: 18 },
            ],
          },
        },
      });
    }

    return NextResponse.json({ round });
  } catch (error) {
    console.error("Error creating round:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
