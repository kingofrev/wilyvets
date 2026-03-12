import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMatchState, calculateSettlement, type HoleResult } from "@/lib/games/nassau";
import { determineHoleWinner } from "@/lib/utils";

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

    // Get round with all data
    const round = await prisma.round.findUnique({
      where: { id },
      include: {
        course: {
          include: { holes: true },
        },
        players: {
          include: {
            player: true,
            scores: true,
          },
        },
        matches: {
          include: {
            player1: {
              include: { player: true, scores: true },
            },
            player2: {
              include: { player: true, scores: true },
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

    const betAmount = parseFloat(round.betAmount.toString());

    // Process each match and update head-to-head records
    for (const match of round.matches) {
      // Build hole results
      const holeResults: HoleResult[] = [];

      for (let holeNum = 1; holeNum <= 18; holeNum++) {
        const p1Score = match.player1.scores.find((s) => s.holeNumber === holeNum);
        const p2Score = match.player2.scores.find((s) => s.holeNumber === holeNum);

        if (p1Score && p2Score) {
          const p1Net = p1Score.netStrokes;
          const p2Net = p2Score.netStrokes;

          holeResults.push({
            holeNumber: holeNum,
            player1Gross: p1Score.grossStrokes,
            player2Gross: p2Score.grossStrokes,
            player1Net: p1Net,
            player2Net: p2Net,
            player1StrokesReceived: p1Score.strokesReceived,
            player2StrokesReceived: p2Score.strokesReceived,
            winner: determineHoleWinner(p1Net, p2Net),
          });
        }
      }

      const matchState = calculateMatchState(
        holeResults,
        round.autoPressAt2,
        match.player1Id,
        match.player2Id
      );

      const settlement = calculateSettlement(
        matchState,
        betAmount,
        match.player1Id,
        match.player2Id
      );

      // Get the player IDs (from Player table, not RoundPlayer)
      const player1Id = match.player1.playerId;
      const player2Id = match.player2.playerId;

      if (!player1Id || !player2Id) continue;

      // Determine who won overall (based on settlement)
      let player1Wins = 0;
      let player2Wins = 0;
      let ties = 0;

      if (!settlement) {
        ties = 1;
      } else if (settlement.toPlayerId === match.player1Id) {
        player1Wins = 1;
      } else {
        player2Wins = 1;
      }

      const netAmount = settlement?.amount || 0;

      // Find or create head-to-head record
      // Always store with lower ID as player1 for consistency
      const [sortedP1, sortedP2] = [player1Id, player2Id].sort();
      const isSwapped = sortedP1 !== player1Id;

      const existingRecord = await prisma.headToHeadRecord.findFirst({
        where: {
          player1Id: sortedP1,
          player2Id: sortedP2,
        },
      });

      if (existingRecord) {
        // Update existing record
        await prisma.headToHeadRecord.update({
          where: { id: existingRecord.id },
          data: {
            player1Wins: {
              increment: isSwapped ? player2Wins : player1Wins,
            },
            player2Wins: {
              increment: isSwapped ? player1Wins : player2Wins,
            },
            ties: {
              increment: ties,
            },
            player1NetWinnings: {
              increment: isSwapped ? -netAmount : netAmount,
            },
            player2NetWinnings: {
              increment: isSwapped ? netAmount : -netAmount,
            },
          },
        });
      } else {
        // Create new record
        await prisma.headToHeadRecord.create({
          data: {
            player1Id: sortedP1,
            player2Id: sortedP2,
            player1Wins: isSwapped ? player2Wins : player1Wins,
            player2Wins: isSwapped ? player1Wins : player2Wins,
            ties,
            player1NetWinnings: isSwapped
              ? (settlement?.toPlayerId === match.player2Id ? netAmount : -netAmount)
              : (settlement?.toPlayerId === match.player1Id ? netAmount : -netAmount),
            player2NetWinnings: isSwapped
              ? (settlement?.toPlayerId === match.player1Id ? netAmount : -netAmount)
              : (settlement?.toPlayerId === match.player2Id ? netAmount : -netAmount),
          },
        });
      }

      // Create settlement record
      if (settlement) {
        const fromRoundPlayer = settlement.fromPlayerId === match.player1Id
          ? match.player1
          : match.player2;
        const toRoundPlayer = settlement.toPlayerId === match.player1Id
          ? match.player1
          : match.player2;

        await prisma.settlement.create({
          data: {
            roundId: round.id,
            matchId: match.id,
            fromPlayerId: fromRoundPlayer.playerId!,
            toPlayerId: toRoundPlayer.playerId!,
            amount: netAmount,
            isPaid: false,
          },
        });
      }
    }

    // Mark round as completed
    await prisma.round.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error completing round:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
