import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStrokesOnHole, determineHoleWinner, calculateCourseHandicap } from "@/lib/utils";
import { calculateMatchState, calculateSettlement } from "@/lib/games/nassau";

interface ScoreInput {
  roundPlayerId: string;
  holeNumber: number;
  grossStrokes: number;
}

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
    const { scores } = (await request.json()) as { scores: ScoreInput[] };

    // Get round with course holes for handicap calculations
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
          },
        },
        matches: {
          include: {
            player1: true,
            player2: true,
          },
        },
      },
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    // Calculate course handicaps for all players using USGA formula
    const coursePar = round.course.holes.reduce((sum, h) => sum + h.par, 0);
    const courseRating = round.course.rating ? parseFloat(round.course.rating.toString()) : null;
    const courseSlope = round.course.slope;

    const playerCourseHandicaps = round.players.map((p) => ({
      id: p.id,
      courseHandicap: calculateCourseHandicap(
        parseFloat(p.handicap.toString()),
        courseSlope,
        courseRating,
        coursePar
      ),
    }));
    const groupLowestCourseHandicap = Math.min(...playerCourseHandicaps.map(p => p.courseHandicap));

    // Save each score
    for (const score of scores) {
      const roundPlayer = round.players.find((p) => p.id === score.roundPlayerId);
      if (!roundPlayer) continue;

      const hole = round.course.holes.find((h) => h.holeNumber === score.holeNumber);
      if (!hole) continue;

      // Calculate strokes received based on handicap mode using course handicap
      let strokesReceived = 0;
      if (round.handicapMode === "GROUP_LOWEST") {
        const playerCourseHcp = playerCourseHandicaps.find(p => p.id === roundPlayer.id)?.courseHandicap || 0;
        const strokeDiff = playerCourseHcp - groupLowestCourseHandicap;
        if (strokeDiff >= hole.handicap) {
          strokesReceived = strokeDiff >= hole.handicap + 18 ? 2 : 1;
        }
      }
      // For MATCH_LOWEST mode, strokes are calculated per-match later

      const netStrokes = score.grossStrokes - strokesReceived;

      await prisma.holeScore.upsert({
        where: {
          roundPlayerId_holeNumber: {
            roundPlayerId: score.roundPlayerId,
            holeNumber: score.holeNumber,
          },
        },
        update: {
          grossStrokes: score.grossStrokes,
          netStrokes,
          strokesReceived,
        },
        create: {
          roundPlayerId: score.roundPlayerId,
          holeNumber: score.holeNumber,
          grossStrokes: score.grossStrokes,
          netStrokes,
          strokesReceived,
        },
      });
    }

    // Update match states
    // Get all scores for the round
    const allScores = await prisma.holeScore.findMany({
      where: {
        roundPlayer: {
          roundId: id,
        },
      },
      include: {
        roundPlayer: true,
      },
    });

    // Process each match
    for (const match of round.matches) {
      const player1Scores = allScores.filter(
        (s) => s.roundPlayerId === match.player1Id
      );
      const player2Scores = allScores.filter(
        (s) => s.roundPlayerId === match.player2Id
      );

      // Use course handicaps
      const player1CourseHcp = playerCourseHandicaps.find(p => p.id === match.player1Id)?.courseHandicap || 0;
      const player2CourseHcp = playerCourseHandicaps.find(p => p.id === match.player2Id)?.courseHandicap || 0;

      // Build hole results for this match
      const holeResults = [];
      for (let holeNum = 1; holeNum <= 18; holeNum++) {
        const p1Score = player1Scores.find((s) => s.holeNumber === holeNum);
        const p2Score = player2Scores.find((s) => s.holeNumber === holeNum);

        if (p1Score && p2Score) {
          const hole = round.course.holes.find((h) => h.holeNumber === holeNum);
          if (!hole) continue;

          let p1Strokes = 0;
          let p2Strokes = 0;

          if (round.handicapMode === "GROUP_LOWEST") {
            p1Strokes = p1Score.strokesReceived;
            p2Strokes = p2Score.strokesReceived;
          } else {
            // MATCH_LOWEST - calculate based on match pairing using course handicaps
            p1Strokes = getStrokesOnHole(
              player1CourseHcp,
              player2CourseHcp,
              hole.handicap,
              "MATCH_LOWEST"
            );
            p2Strokes = getStrokesOnHole(
              player2CourseHcp,
              player1CourseHcp,
              hole.handicap,
              "MATCH_LOWEST"
            );
          }

          const p1Net = p1Score.grossStrokes - p1Strokes;
          const p2Net = p2Score.grossStrokes - p2Strokes;

          holeResults.push({
            holeNumber: holeNum,
            player1Gross: p1Score.grossStrokes,
            player2Gross: p2Score.grossStrokes,
            player1Net: p1Net,
            player2Net: p2Net,
            player1StrokesReceived: p1Strokes,
            player2StrokesReceived: p2Strokes,
            winner: determineHoleWinner(p1Net, p2Net),
          });
        }
      }

      // Calculate match state
      const matchState = calculateMatchState(
        holeResults,
        round.autoPressAt2,
        match.player1Id,
        match.player2Id
      );

      // Update match results
      await prisma.matchResult.updateMany({
        where: { matchId: match.id, segment: "FRONT_9" },
        data: {
          player1Status: matchState.front9.player1Status,
          holesRemaining: matchState.front9.holesRemaining,
          isClosed: matchState.front9.isClosed,
          winnerId: matchState.front9.winnerId,
        },
      });

      await prisma.matchResult.updateMany({
        where: { matchId: match.id, segment: "BACK_9" },
        data: {
          player1Status: matchState.back9.player1Status,
          holesRemaining: matchState.back9.holesRemaining,
          isClosed: matchState.back9.isClosed,
          winnerId: matchState.back9.winnerId,
        },
      });

      await prisma.matchResult.updateMany({
        where: { matchId: match.id, segment: "OVERALL_18" },
        data: {
          player1Status: matchState.overall18.player1Status,
          holesRemaining: matchState.overall18.holesRemaining,
          isClosed: matchState.overall18.isClosed,
          winnerId: matchState.overall18.winnerId,
        },
      });

      // Handle presses
      // Delete existing presses for this match
      await prisma.press.deleteMany({
        where: { matchId: match.id },
      });

      // Create new presses
      for (const press of matchState.presses) {
        await prisma.press.create({
          data: {
            matchId: match.id,
            segment: press.segment,
            startHole: press.startHole,
            player1Status: press.player1Status,
            holesRemaining: press.holesRemaining,
            isClosed: press.isClosed,
            winnerId: press.winnerId,
            triggeredById: press.triggeredBy,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving scores:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
