import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all head-to-head records
    const records = await prisma.headToHeadRecord.findMany({
      include: {
        player1: true,
        player2: true,
      },
    });

    // Calculate lifetime stats per player
    const playerStats: Record<
      string,
      {
        playerId: string;
        playerName: string;
        matchesPlayed: number;
        wins: number;
        losses: number;
        ties: number;
        totalWon: number;
        totalLost: number;
      }
    > = {};

    for (const record of records) {
      // Initialize player 1 stats
      if (!playerStats[record.player1Id]) {
        playerStats[record.player1Id] = {
          playerId: record.player1Id,
          playerName: record.player1.name,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          totalWon: 0,
          totalLost: 0,
        };
      }

      // Initialize player 2 stats
      if (!playerStats[record.player2Id]) {
        playerStats[record.player2Id] = {
          playerId: record.player2Id,
          playerName: record.player2.name,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          totalWon: 0,
          totalLost: 0,
        };
      }

      // Update player 1 stats
      const p1Stats = playerStats[record.player1Id];
      p1Stats.matchesPlayed += record.player1Wins + record.player2Wins + record.ties;
      p1Stats.wins += record.player1Wins;
      p1Stats.losses += record.player2Wins;
      p1Stats.ties += record.ties;
      p1Stats.totalWon += parseFloat(record.player1NetWinnings.toString());
      if (parseFloat(record.player1NetWinnings.toString()) < 0) {
        p1Stats.totalLost += Math.abs(parseFloat(record.player1NetWinnings.toString()));
      }

      // Update player 2 stats
      const p2Stats = playerStats[record.player2Id];
      p2Stats.matchesPlayed += record.player1Wins + record.player2Wins + record.ties;
      p2Stats.wins += record.player2Wins;
      p2Stats.losses += record.player1Wins;
      p2Stats.ties += record.ties;
      p2Stats.totalWon += parseFloat(record.player2NetWinnings.toString());
      if (parseFloat(record.player2NetWinnings.toString()) < 0) {
        p2Stats.totalLost += Math.abs(parseFloat(record.player2NetWinnings.toString()));
      }
    }

    return NextResponse.json({
      records: records.map((r) => ({
        id: r.id,
        player1: { id: r.player1Id, name: r.player1.name },
        player2: { id: r.player2Id, name: r.player2.name },
        player1Wins: r.player1Wins,
        player2Wins: r.player2Wins,
        ties: r.ties,
        player1NetWinnings: parseFloat(r.player1NetWinnings.toString()),
        player2NetWinnings: parseFloat(r.player2NetWinnings.toString()),
      })),
      playerStats: Object.values(playerStats).sort(
        (a, b) => b.totalWon - b.totalLost - (a.totalWon - a.totalLost)
      ),
    });
  } catch (error) {
    console.error("Error fetching records:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
