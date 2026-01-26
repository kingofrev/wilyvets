"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { cn, formatMatchStatus, formatCurrency } from "@/lib/utils";
import { calculateMatchState, calculateSettlement, type HoleResult } from "@/lib/games/nassau";

interface Player {
  id: string;
  name: string;
}

interface RoundPlayer {
  id: string;
  handicap: string;
  player: Player;
  scores: {
    holeNumber: number;
    grossStrokes: number;
    netStrokes: number;
    strokesReceived: number;
  }[];
}

interface MatchResult {
  segment: string;
  player1Status: number;
  holesRemaining: number;
  isClosed: boolean;
}

interface Press {
  id: string;
  segment: string;
  startHole: number;
  player1Status: number;
  holesRemaining: number;
  isClosed: boolean;
}

interface Match {
  id: string;
  player1: RoundPlayer;
  player2: RoundPlayer;
  strokeDifference: number;
  results: MatchResult[];
  presses: Press[];
}

interface Hole {
  holeNumber: number;
  par: number;
  handicap: number;
}

interface Round {
  id: string;
  status: string;
  betAmount: string;
  handicapMode: string;
  autoPressAt2: boolean;
  course: {
    id: string;
    name: string;
    holes: Hole[];
  };
  players: RoundPlayer[];
  matches: Match[];
}

interface Settlement {
  fromPlayer: string;
  toPlayer: string;
  amount: number;
}

export default function RoundResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [round, setRound] = useState<Round | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  useEffect(() => {
    fetchRound();
  }, [id]);

  async function fetchRound() {
    const response = await fetch(`/api/rounds/${id}`);
    if (response.ok) {
      const data = await response.json();
      setRound(data.round);
      calculateSettlements(data.round);
    }
  }

  function calculateSettlements(roundData: Round) {
    const betAmount = parseFloat(roundData.betAmount);
    const playerTotals: Record<string, number> = {};

    // Initialize player totals
    for (const player of roundData.players) {
      playerTotals[player.id] = 0;
    }

    // Calculate for each match
    for (const match of roundData.matches) {
      // Build hole results for this match
      const holeResults: HoleResult[] = [];
      const p1Scores = match.player1.scores || [];
      const p2Scores = match.player2.scores || [];

      for (let holeNum = 1; holeNum <= 18; holeNum++) {
        const p1Score = p1Scores.find((s) => s.holeNumber === holeNum);
        const p2Score = p2Scores.find((s) => s.holeNumber === holeNum);

        if (p1Score && p2Score) {
          const hole = roundData.course.holes.find((h) => h.holeNumber === holeNum);
          if (!hole) continue;

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
            winner: p1Net < p2Net ? "player1" : p1Net > p2Net ? "player2" : "tie",
          });
        }
      }

      const matchState = calculateMatchState(
        holeResults,
        roundData.autoPressAt2,
        match.player1.id,
        match.player2.id
      );

      const settlement = calculateSettlement(
        matchState,
        betAmount,
        match.player1.id,
        match.player2.id
      );

      if (settlement) {
        playerTotals[settlement.toPlayerId] += settlement.amount;
        playerTotals[settlement.fromPlayerId] -= settlement.amount;
      }
    }

    // Convert to settlements list (who pays whom)
    const finalSettlements: Settlement[] = [];
    const sortedPlayers = roundData.players
      .map((p) => ({ ...p, total: playerTotals[p.id] }))
      .sort((a, b) => a.total - b.total); // Losers first

    // Simple settlement: losers pay winners
    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      if (player.total < 0) {
        // This player owes money
        let remaining = Math.abs(player.total);
        for (let j = sortedPlayers.length - 1; j >= 0 && remaining > 0; j--) {
          const winner = sortedPlayers[j];
          if (winner.total > 0) {
            const amount = Math.min(remaining, winner.total);
            if (amount > 0) {
              finalSettlements.push({
                fromPlayer: player.player.name,
                toPlayer: winner.player.name,
                amount,
              });
              remaining -= amount;
              sortedPlayers[j].total -= amount;
            }
          }
        }
      }
    }

    setSettlements(finalSettlements);
  }

  if (!round) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading results...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/rounds/${id}/play`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Round Results</h2>
          <p className="text-muted-foreground">{round.course.name}</p>
        </div>
      </div>

      {/* Settlement Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Settlements
          </CardTitle>
          <CardDescription>
            ${round.betAmount} Nassau
            {round.autoPressAt2 && " with auto-press"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No settlements - all matches are tied or incomplete
            </p>
          ) : (
            <div className="space-y-3">
              {settlements.map((settlement, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-red-600">
                      {settlement.fromPlayer}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-green-600">
                      {settlement.toPlayer}
                    </span>
                  </div>
                  <span className="font-bold">
                    {formatCurrency(settlement.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Match Details */}
      <div className="space-y-3">
        <h3 className="font-semibold">Match Details</h3>
        {round.matches.map((match) => {
          const front9 = match.results.find((r) => r.segment === "FRONT_9");
          const back9 = match.results.find((r) => r.segment === "BACK_9");
          const overall = match.results.find((r) => r.segment === "OVERALL_18");

          const formatResult = (result: MatchResult | undefined, label: string) => {
            if (!result) return null;
            const status = result.player1Status;
            const remaining = result.holesRemaining;

            let winner = null;
            let displayText = "Tied";

            if (result.isClosed) {
              // Match closed out early
              const margin = Math.abs(status);
              displayText = `${margin}&${remaining}`;
              winner = status > 0 ? match.player1.player.name : match.player2.player.name;
            } else if (remaining === 0 && status !== 0) {
              displayText = `${Math.abs(status)} up`;
              winner = status > 0 ? match.player1.player.name : match.player2.player.name;
            }

            return (
              <div className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <span className="text-sm text-muted-foreground">{label}</span>
                  {winner && (
                    <p className="font-medium text-sm">{winner}</p>
                  )}
                </div>
                <Badge
                  variant={winner ? "default" : "secondary"}
                  className={cn(
                    winner && status > 0 && "bg-green-600",
                    winner && status < 0 && "bg-red-600"
                  )}
                >
                  {displayText}
                </Badge>
              </div>
            );
          };

          return (
            <Card key={match.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>
                    {match.player1.player.name} vs {match.player2.player.name}
                  </span>
                  {match.strokeDifference > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {match.strokeDifference} strokes
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {formatResult(front9, "Front 9")}
                {formatResult(back9, "Back 9")}
                {formatResult(overall, "Overall 18")}

                {match.presses.length > 0 && (
                  <div className="pt-2 mt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Presses</p>
                    {match.presses.map((press, idx) => {
                      const winner = press.player1Status > 0
                        ? match.player1.player.name
                        : press.player1Status < 0
                        ? match.player2.player.name
                        : null;

                      return (
                        <div
                          key={press.id || idx}
                          className="flex items-center justify-between text-sm py-1"
                        >
                          <span>
                            Hole {press.startHole}+ ({press.segment === "FRONT_9" ? "F9" : "B9"})
                          </span>
                          <span className="font-medium">
                            {winner || "Tied"}{" "}
                            {winner && `(${formatMatchStatus(press.player1Status)})`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button className="w-full" variant="outline" asChild>
          <Link href={`/rounds/${id}/play`}>
            Back to Scorecard
          </Link>
        </Button>
        <Button className="w-full" asChild>
          <Link href="/">
            <Check className="h-4 w-4 mr-2" />
            Done
          </Link>
        </Button>
      </div>
    </div>
  );
}
