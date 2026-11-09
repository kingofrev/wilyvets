"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy, ArrowRight, Check, Layers } from "lucide-react";
import Link from "next/link";
import { cn, formatMatchStatus, formatCurrency, getStrokesOnHole, calculateCourseHandicap } from "@/lib/utils";
import {
  buildMatchHoleResults,
  calculateMatchState,
  calculateSettlement,
  type HoleResult,
} from "@/lib/games/nassau";
import { calculateNinesState, calculateNinesSettlement, type NinesSettlement } from "@/lib/games/nines";
import {
  calculateTrashSettlement,
  countBirdies,
  type TrashSettlement,
} from "@/lib/games/trash";
import { combineNets, settleUp, type Payment, type PlayerNet } from "@/lib/games/settlement";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { MatchSegment } from "@prisma/client";

const SEGMENT_SHORT_LABELS: Record<string, string> = {
  FRONT_9: "F9",
  BACK_9: "B9",
  OVERALL_18: "O18",
};

interface Player {
  id: string;
  name: string;
}

interface RoundPlayer {
  id: string;
  handicap: string;
  player: Player;
  trash?: { greenies: number; sandies: number; others: number } | null;
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
  isManual: boolean;
  triggeredById: string;
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
  ninesEnabled: boolean;
  ninesPointValue: string;
  trashEnabled: boolean;
  trashPointValue: string;
  course: {
    id: string;
    name: string;
    slope: number | null;
    rating: string | null;
    holes: Hole[];
  };
  players: RoundPlayer[];
  matches: Match[];
}

// What one match contributed to the Nassau money, from player1's side
interface MatchMoney {
  matchId: string;
  player1Name: string;
  player2Name: string;
  front9: number;
  back9: number;
  overall18: number;
  presses: number;
  pressCount: number;
  player1Total: number;
}

function moneyClass(amount: number): string {
  if (amount > 0.005) return "text-green-600";
  if (amount < -0.005) return "text-red-600";
  return "text-muted-foreground";
}

// Money with its direction shown, or a dash when a player came out level
function formatSigned(amount: number): string {
  if (Math.abs(amount) < 0.005) return "—";
  return `${amount > 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}

function PaymentList({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        All square — nothing to settle
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((payment, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-red-600">
              {payment.fromPlayer}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-green-600">
              {payment.toPlayer}
            </span>
          </div>
          <span className="font-bold tabular-nums">
            {formatCurrency(payment.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RoundResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [round, setRound] = useState<Round | null>(null);
  const [nassauNets, setNassauNets] = useState<PlayerNet[]>([]);
  const [matchMoney, setMatchMoney] = useState<MatchMoney[]>([]);
  const [ninesSettlements, setNinesSettlements] = useState<NinesSettlement[]>([]);
  const [trashSettlements, setTrashSettlements] = useState<TrashSettlement[]>([]);
  const [combineAll, setCombineAll] = useState(false);

  useEffect(() => {
    fetchRound();
  }, [id]);

  async function fetchRound() {
    const response = await fetch(`/api/rounds/${id}`);
    if (response.ok) {
      const data = await response.json();
      setRound(data.round);
      calculateSettlements(data.round);
      if (data.round.ninesEnabled && (data.round.players.length === 3 || data.round.players.length === 4)) {
        calculateNines(data.round);
      }
      if (data.round.trashEnabled) {
        calculateTrash(data.round);
      }
    }
  }

  function getPlayerCourseHandicap(roundData: Round, playerId: string): number {
    const player = roundData.players.find(p => p.id === playerId);
    if (!player) return 0;

    const handicapIndex = parseFloat(player.handicap);
    const coursePar = roundData.course.holes.reduce((sum, h) => sum + h.par, 0);
    const courseRating = roundData.course.rating ? parseFloat(roundData.course.rating) : null;

    return calculateCourseHandicap(handicapIndex, roundData.course.slope, courseRating, coursePar);
  }

  function getPlayerStrokesOnHoleForRound(roundData: Round, playerId: string, holeNumber: number): number {
    const player = roundData.players.find(p => p.id === playerId);
    if (!player) return 0;

    const hole = roundData.course.holes.find(h => h.holeNumber === holeNumber);
    if (!hole) return 0;

    const playerCourseHcp = getPlayerCourseHandicap(roundData, playerId);
    const allCourseHandicaps = roundData.players.map(p => getPlayerCourseHandicap(roundData, p.id));
    const groupLowest = Math.min(...allCourseHandicaps);

    return getStrokesOnHole(playerCourseHcp, groupLowest, hole.handicap, "GROUP_LOWEST", groupLowest);
  }

  function calculateNines(roundData: Round) {
    const holeScores: { holeNumber: number; scores: { playerId: string; netScore: number }[] }[] = [];

    for (let hole = 1; hole <= 18; hole++) {
      const allScored = roundData.players.every(
        (p) => p.scores.some((s) => s.holeNumber === hole)
      );

      if (allScored) {
        holeScores.push({
          holeNumber: hole,
          scores: roundData.players.map((p) => {
            const score = p.scores.find((s) => s.holeNumber === hole);
            const grossStrokes = score?.grossStrokes || 0;
            const strokesReceived = getPlayerStrokesOnHoleForRound(roundData, p.id, hole);
            const netScore = grossStrokes - strokesReceived;
            return { playerId: p.id, netScore };
          }),
        });
      }
    }

    const ninesState = calculateNinesState(holeScores);
    const pointValue = parseFloat(roundData.ninesPointValue);
    const playerNames = roundData.players.map((p) => ({
      playerId: p.id,
      name: p.player.name,
    }));

    const settlements = calculateNinesSettlement(ninesState, pointValue, playerNames);
    setNinesSettlements(settlements);
  }

  function calculateTrash(roundData: Round) {
    const pointValue = parseFloat(roundData.trashPointValue) || 0;

    setTrashSettlements(
      calculateTrashSettlement(
        roundData.players.map((player) => ({
          playerId: player.id,
          playerName: player.player.name,
          counts: {
            birdies: countBirdies(player.scores, roundData.course.holes),
            greenies: player.trash?.greenies ?? 0,
            sandies: player.trash?.sandies ?? 0,
            others: player.trash?.others ?? 0,
          },
        })),
        pointValue
      )
    );
  }

  function calculateSettlements(roundData: Round) {
    const betAmount = parseFloat(roundData.betAmount);
    const playerTotals: Record<string, number> = {};
    const perMatch: MatchMoney[] = [];

    for (const player of roundData.players) {
      playerTotals[player.id] = 0;
    }

    for (const match of roundData.matches) {
      const holeResults: HoleResult[] = buildMatchHoleResults(
        roundData.course.holes,
        roundData.handicapMode === "MATCH_LOWEST"
          ? "MATCH_LOWEST"
          : "GROUP_LOWEST",
        {
          courseHandicap: getPlayerCourseHandicap(roundData, match.player1.id),
          scores: match.player1.scores || [],
        },
        {
          courseHandicap: getPlayerCourseHandicap(roundData, match.player2.id),
          scores: match.player2.scores || [],
        }
      );

      const matchState = calculateMatchState(
        holeResults,
        roundData.autoPressAt2,
        match.player1.id,
        match.player2.id,
        (match.presses || [])
          .filter((press) => press.isManual)
          .map((press) => ({
            id: press.id,
            segment: press.segment as MatchSegment,
            startHole: press.startHole,
            triggeredBy: press.triggeredById,
          }))
      );

      const settlement = calculateSettlement(
        matchState,
        betAmount,
        match.player1.id,
        match.player2.id
      );

      // calculateSettlement reports the breakdown from player1's side, and
      // returns nothing at all when the match is level
      const breakdown = settlement?.breakdown ?? {
        front9: 0,
        back9: 0,
        overall18: 0,
        presses: 0,
      };
      const player1Total =
        breakdown.front9 +
        breakdown.back9 +
        breakdown.overall18 +
        breakdown.presses;

      perMatch.push({
        matchId: match.id,
        player1Name: match.player1.player.name,
        player2Name: match.player2.player.name,
        ...breakdown,
        pressCount: matchState.presses.filter((press) => press.isComplete).length,
        player1Total,
      });

      playerTotals[match.player1.id] += player1Total;
      playerTotals[match.player2.id] -= player1Total;
    }

    setMatchMoney(perMatch);
    setNassauNets(
      roundData.players.map((player) => ({
        playerId: player.id,
        playerName: player.player.name,
        amount: Math.round(playerTotals[player.id] * 100) / 100,
      }))
    );
  }

  if (!round) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading results...</p>
      </div>
    );
  }

  // Each bet that actually ran, as per-player net amounts
  const activeBets: {
    label: string;
    description: string;
    nets: PlayerNet[];
  }[] = [
    {
      label: "Nassau",
      description: `${round.betAmount} a side`,
      nets: nassauNets,
    },
  ];

  if (round.ninesEnabled && ninesSettlements.length > 0) {
    activeBets.push({
      label: "9s",
      description: `${round.ninesPointValue} a point`,
      nets: ninesSettlements.map((settlement) => ({
        playerId: settlement.playerId,
        playerName: settlement.playerName,
        amount: settlement.amount,
      })),
    });
  }

  if (round.trashEnabled && trashSettlements.length > 0) {
    activeBets.push({
      label: "Trash",
      description: `${round.trashPointValue} a point`,
      nets: trashSettlements.map((settlement) => ({
        playerId: settlement.playerId,
        playerName: settlement.playerName,
        amount: settlement.amount,
      })),
    });
  }

  const combinedNets = combineNets(...activeBets.map((bet) => bet.nets));
  const betSummary =
    activeBets.map((bet) => bet.label).join(" · ") +
    (round.autoPressAt2 ? " · auto-press" : "");

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

      {/* Settle up — each bet on its own, or all of them at once */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Settlements
          </CardTitle>
          <CardDescription>{betSummary}</CardDescription>
          {activeBets.length > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Label
                htmlFor="combine-bets"
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="h-4 w-4" />
                Combine all bets and settle
              </Label>
              <Switch
                id="combine-bets"
                checked={combineAll}
                onCheckedChange={setCombineAll}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {combineAll ? (
            <>
              {/* Where each player's combined number came from */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left font-normal pb-1">Player</th>
                      {activeBets.map((bet) => (
                        <th
                          key={bet.label}
                          className="text-right font-normal pb-1 px-2"
                        >
                          {bet.label}
                        </th>
                      ))}
                      <th className="text-right font-normal pb-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedNets
                      .slice()
                      .sort((a, b) => b.amount - a.amount)
                      .map((net) => (
                        <tr key={net.playerId} className="border-b last:border-0">
                          <td className="py-1.5 font-medium">
                            {net.playerName.split(" ")[0]}
                          </td>
                          {activeBets.map((bet) => {
                            const amount =
                              bet.nets.find((n) => n.playerId === net.playerId)
                                ?.amount ?? 0;
                            return (
                              <td
                                key={bet.label}
                                className={cn(
                                  "py-1.5 text-right tabular-nums px-2",
                                  moneyClass(amount)
                                )}
                              >
                                {formatSigned(amount)}
                              </td>
                            );
                          })}
                          <td
                            className={cn(
                              "py-1.5 text-right font-bold tabular-nums",
                              moneyClass(net.amount)
                            )}
                          >
                            {formatSigned(net.amount)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <PaymentList payments={settleUp(combinedNets)} />
            </>
          ) : (
            <div className="space-y-4">
              {activeBets.map((bet) => (
                <div key={bet.label} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{bet.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {bet.description}
                    </p>
                  </div>
                  <PaymentList payments={settleUp(bet.nets)} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 9s detail */}
      {round.ninesEnabled && ninesSettlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">9s Game</CardTitle>
            <CardDescription>${round.ninesPointValue} per point</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ninesSettlements
                .slice()
                .sort((a, b) => b.amount - a.amount)
                .map((settlement) => (
                  <div
                    key={settlement.playerId}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div>
                      <span className="font-medium">
                        {settlement.playerName}
                      </span>
                      <p className="text-sm text-muted-foreground">
                        {settlement.totalPoints} points (net{" "}
                        {settlement.netPoints >= 0 ? "+" : ""}
                        {settlement.netPoints.toFixed(1)})
                      </p>
                    </div>
                    <span
                      className={cn(
                        "font-bold tabular-nums",
                        moneyClass(settlement.amount)
                      )}
                    >
                      {formatSigned(settlement.amount)}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trash detail */}
      {round.trashEnabled && trashSettlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trash</CardTitle>
            <CardDescription>
              ${round.trashPointValue} per point · birdies counted from the card
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left font-normal pb-1">Player</th>
                  <th className="text-right font-normal pb-1 px-1">Bird</th>
                  <th className="text-right font-normal pb-1 px-1">Green</th>
                  <th className="text-right font-normal pb-1 px-1">Sand</th>
                  <th className="text-right font-normal pb-1 px-1">Other</th>
                  <th className="text-right font-normal pb-1 px-1">Pts</th>
                  <th className="text-right font-normal pb-1">$</th>
                </tr>
              </thead>
              <tbody>
                {trashSettlements
                  .slice()
                  .sort((a, b) => b.amount - a.amount)
                  .map((settlement) => (
                    <tr
                      key={settlement.playerId}
                      className="border-b last:border-0"
                    >
                      <td className="py-1.5 font-medium">
                        {settlement.playerName.split(" ")[0]}
                      </td>
                      <td className="py-1.5 text-right tabular-nums px-1">
                        {settlement.counts.birdies}
                      </td>
                      <td className="py-1.5 text-right tabular-nums px-1">
                        {settlement.counts.greenies}
                      </td>
                      <td className="py-1.5 text-right tabular-nums px-1">
                        {settlement.counts.sandies}
                      </td>
                      <td className="py-1.5 text-right tabular-nums px-1">
                        {settlement.counts.others}
                      </td>
                      <td className="py-1.5 text-right tabular-nums px-1 font-medium">
                        {settlement.totalPoints}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 text-right font-bold tabular-nums",
                          moneyClass(settlement.amount)
                        )}
                      >
                        {formatSigned(settlement.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Match Details */}
      <div className="space-y-3">
        <h3 className="font-semibold">Match Details</h3>
        <p className="text-sm text-muted-foreground -mt-2">
          Amounts are from the first-named player&apos;s side
        </p>
        {round.matches.map((match) => {
          const front9 = match.results.find((r) => r.segment === "FRONT_9");
          const back9 = match.results.find((r) => r.segment === "BACK_9");
          const overall = match.results.find((r) => r.segment === "OVERALL_18");
          const money = matchMoney.find((m) => m.matchId === match.id);

          const formatResult = (
            result: MatchResult | undefined,
            label: string,
            amount: number
          ) => {
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
                <div className="flex items-center gap-3">
                  <Badge
                    variant={winner ? "default" : "secondary"}
                    className={cn(
                      winner && status > 0 && "bg-green-600",
                      winner && status < 0 && "bg-red-600"
                    )}
                  >
                    {displayText}
                  </Badge>
                  <span
                    className={cn(
                      "text-sm font-bold tabular-nums w-16 text-right",
                      moneyClass(amount)
                    )}
                  >
                    {formatSigned(amount)}
                  </span>
                </div>
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
                {formatResult(front9, "Front 9", money?.front9 ?? 0)}
                {formatResult(back9, "Back 9", money?.back9 ?? 0)}
                {formatResult(overall, "Overall 18", money?.overall18 ?? 0)}

                {match.presses.length > 0 && (
                  <div className="pt-2 mt-2 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">
                        Presses
                        {!!money?.pressCount && ` (${money.pressCount} settled)`}
                      </p>
                      <span
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          moneyClass(money?.presses ?? 0)
                        )}
                      >
                        {formatSigned(money?.presses ?? 0)}
                      </span>
                    </div>
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
                          <span className="flex items-center gap-1.5">
                            Hole {press.startHole}+ (
                            {SEGMENT_SHORT_LABELS[press.segment] ?? press.segment})
                            {!press.isManual && (
                              <Badge variant="secondary" className="text-[10px]">
                                Auto
                              </Badge>
                            )}
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

                {/* What this match contributed to the Nassau money */}
                {money && (
                  <div className="flex items-center justify-between pt-2 mt-2 border-t">
                    <span className="text-sm font-medium">
                      {Math.abs(money.player1Total) < 0.005
                        ? "Match all square"
                        : `${
                            money.player1Total > 0
                              ? match.player1.player.name.split(" ")[0]
                              : match.player2.player.name.split(" ")[0]
                          } collects`}
                    </span>
                    <span className="font-bold tabular-nums">
                      {Math.abs(money.player1Total) < 0.005
                        ? "—"
                        : formatCurrency(Math.abs(money.player1Total))}
                    </span>
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
