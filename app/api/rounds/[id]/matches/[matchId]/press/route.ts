import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatchSegment } from "@prisma/client";
import {
  getPressOpportunities,
  getSegmentEndHole,
  getSegmentStartHole,
  type PressBet,
} from "@/lib/games/nassau";

const SEGMENTS: MatchSegment[] = ["FRONT_9", "BACK_9", "OVERALL_18"];

async function loadMatch(roundId: string, matchId: string) {
  return prisma.match.findFirst({
    where: { id: matchId, roundId },
    include: {
      round: true,
      player1: { include: { scores: true } },
      player2: { include: { scores: true } },
      results: true,
      presses: true,
    },
  });
}

// POST — take a press on one of the three Nassau bets
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, matchId } = await params;
    const { segment } = (await request.json()) as { segment?: MatchSegment };

    if (!segment || !SEGMENTS.includes(segment)) {
      return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
    }

    const match = await loadMatch(id, matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (match.round.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Round is already completed" },
        { status: 400 }
      );
    }

    // Last hole both players have scored — the press starts on the next one
    let lastScoredHole = 0;
    for (let hole = 1; hole <= 18; hole++) {
      const p1 = match.player1.scores.some((s) => s.holeNumber === hole);
      const p2 = match.player2.scores.some((s) => s.holeNumber === hole);
      if (p1 && p2) lastScoredHole = hole;
    }

    // The three segment bets plus any press already running, as press targets
    const bets: PressBet[] = [
      ...match.results.map((r) => ({
        segment: r.segment,
        startHole: getSegmentStartHole(r.segment),
        player1Status: r.player1Status,
        isClosed: r.isClosed,
      })),
      ...match.presses.map((p) => ({
        segment: p.segment,
        startHole: p.startHole,
        player1Status: p.player1Status,
        isClosed: p.isClosed,
      })),
    ];

    const opportunity = getPressOpportunities(
      bets,
      lastScoredHole,
      match.player1Id,
      match.player2Id
    ).find((o) => o.segment === segment);

    if (!opportunity) {
      return NextResponse.json(
        { error: "That bet can't be pressed right now" },
        { status: 400 }
      );
    }

    const endHole = getSegmentEndHole(segment);
    const press = await prisma.press.create({
      data: {
        matchId: match.id,
        segment,
        startHole: opportunity.startHole,
        triggeredById: opportunity.downPlayerId,
        isManual: true,
        player1Status: 0,
        holesPlayed: 0,
        holesRemaining: endHole - opportunity.startHole + 1,
        isComplete: false,
        isClosed: false,
      },
    });

    return NextResponse.json({ press });
  } catch (error) {
    console.error("Error creating press:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE — undo a manual press (mis-taps happen); auto presses are derived and
// can't be removed this way
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, matchId } = await params;
    const pressId = request.nextUrl.searchParams.get("pressId");
    if (!pressId) {
      return NextResponse.json({ error: "Missing pressId" }, { status: 400 });
    }

    const press = await prisma.press.findFirst({
      where: {
        id: pressId,
        isManual: true,
        matchId,
        match: { roundId: id, round: { status: { not: "COMPLETED" } } },
      },
    });

    if (!press) {
      return NextResponse.json({ error: "Press not found" }, { status: 404 });
    }

    await prisma.press.delete({ where: { id: press.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting press:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
