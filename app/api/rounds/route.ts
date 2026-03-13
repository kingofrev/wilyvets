import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMatchPairings, calculateCourseHandicap } from "@/lib/utils";

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

    const { courseId, betAmount, handicapMode, autoPressAt2, ninesEnabled, ninesPointValue, players } = await request.json();

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

    // Calculate course handicaps using USGA formula
    const coursePar = course.holes.reduce((sum, h) => sum + h.par, 0);
    const courseRating = course.rating ? parseFloat(course.rating.toString()) : null;
    const courseSlope = course.slope;

    const playerCourseHandicaps = players.map((p: any) => ({
      ...p,
      handicapIndex: parseFloat(p.handicap) || 0,
      courseHandicap: calculateCourseHandicap(parseFloat(p.handicap) || 0, courseSlope, courseRating, coursePar),
    }));
    const lowestCourseHandicap = Math.min(...playerCourseHandicaps.map((p: any) => p.courseHandicap));

    // Create round with players
    const round = await prisma.round.create({
      data: {
        createdById: session.user.id,
        courseId,
        betAmount: parseFloat(betAmount) || 5,
        handicapMode: handicapMode || "GROUP_LOWEST",
        autoPressAt2: autoPressAt2 || false,
        ninesEnabled: ninesEnabled || false,
        ninesPointValue: parseFloat(ninesPointValue) || 1,
        status: "IN_PROGRESS",
        players: {
          create: playerCourseHandicaps.map((p: any) => {
            const strokesGiven = handicapMode === "GROUP_LOWEST"
              ? p.courseHandicap - lowestCourseHandicap
              : 0; // Calculated per-match for MATCH_LOWEST

            return {
              userId: p.userId || null,
              playerId: p.playerId || null,
              handicap: p.handicapIndex,
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

    // Build a map from RoundPlayer id → course handicap (order matches playerCourseHandicaps)
    const courseHcpByRoundPlayerId = new Map<string, number>();
    round.players.forEach((rp, i) => {
      courseHcpByRoundPlayerId.set(rp.id, playerCourseHandicaps[i].courseHandicap);
    });

    // Create matches for all player pairings
    const pairings = generateMatchPairings(round.players);

    for (const [p1, p2] of pairings) {
      const p1CourseHcp = courseHcpByRoundPlayerId.get(p1.id) ?? Number(p1.handicap);
      const p2CourseHcp = courseHcpByRoundPlayerId.get(p2.id) ?? Number(p2.handicap);

      // Calculate stroke difference using course handicaps
      let strokeDiff: number;
      if (handicapMode === "MATCH_LOWEST") {
        const lowestInMatch = Math.min(p1CourseHcp, p2CourseHcp);
        strokeDiff = (p2CourseHcp - lowestInMatch) - (p1CourseHcp - lowestInMatch);
      } else {
        strokeDiff = (p2CourseHcp - lowestCourseHandicap) - (p1CourseHcp - lowestCourseHandicap);
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
