import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCourseHandicap } from "@/lib/utils";
import {
  buildMatchHoleResults,
  calculateMatchState,
} from "@/lib/games/nassau";

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
            presses: {
              where: { isManual: true },
            },
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
      const holeResults = buildMatchHoleResults(
        round.course.holes,
        round.handicapMode,
        { courseHandicap: player1CourseHcp, scores: player1Scores },
        { courseHandicap: player2CourseHcp, scores: player2Scores }
      );

      // Calculate match state. Manual presses are stored bets, so they are fed
      // back in to have their status recalculated against the latest scores.
      const matchState = calculateMatchState(
        holeResults,
        round.autoPressAt2,
        match.player1Id,
        match.player2Id,
        match.presses.map((press) => ({
          id: press.id,
          segment: press.segment,
          startHole: press.startHole,
          triggeredBy: press.triggeredById,
        }))
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

      // Handle presses. Auto presses are derived from the scores, so they are
      // rebuilt from scratch; manual presses are kept and updated in place.
      await prisma.press.deleteMany({
        where: { matchId: match.id, isManual: false },
      });

      for (const press of matchState.presses) {
        const status = {
          player1Status: press.player1Status,
          holesPlayed: press.holesPlayed,
          holesRemaining: press.holesRemaining,
          isComplete: press.isComplete,
          isClosed: press.isClosed,
          winnerId: press.winnerId ?? null,
        };

        if (press.isManual) {
          if (!press.id) continue;
          await prisma.press.update({
            where: { id: press.id },
            data: status,
          });
          continue;
        }

        // Don't double up an auto press on a hole a manual press already covers
        const alreadyPressed = matchState.presses.some(
          (other) =>
            other.isManual &&
            other.segment === press.segment &&
            other.startHole === press.startHole
        );
        if (alreadyPressed) continue;

        await prisma.press.create({
          data: {
            matchId: match.id,
            segment: press.segment,
            startHole: press.startHole,
            isManual: false,
            triggeredById: press.triggeredBy,
            ...status,
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
