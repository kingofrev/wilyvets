"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, X, Zap } from "lucide-react";
import Link from "next/link";
import { cn, formatMatchStatus, getStrokesOnHole, calculateCourseHandicap } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { calculateNinesState, formatHolePoints, type NinesState } from "@/lib/games/nines";
import {
  buildMatchHoleResults,
  getPressOpportunities,
  getSegmentStartHole,
  type HoleResult,
  type PressBet,
  type PressOpportunity,
} from "@/lib/games/nassau";
import type { MatchSegment } from "@prisma/client";

const SEGMENT_LABELS: Record<string, string> = {
  FRONT_9: "Front 9",
  BACK_9: "Back 9",
  OVERALL_18: "Overall",
};

const SEGMENT_SHORT_LABELS: Record<string, string> = {
  FRONT_9: "F9",
  BACK_9: "B9",
  OVERALL_18: "O18",
};

// One nine of a match, hole by hole: each player's gross score, who took the
// hole, and the running status through it — all from player1's point of view.
// Holes are won on net, so a dot marks where a player had a handicap stroke
function HoleStrip({
  label,
  startHole,
  holeResults,
  player1Name,
  player2Name,
}: {
  label: string;
  startHole: number;
  holeResults: HoleResult[];
  player1Name: string;
  player2Name: string;
}) {
  let running = 0;
  const cells = Array.from({ length: 9 }, (_, i) => startHole + i).map(
    (holeNumber) => {
      const result = holeResults.find((h) => h.holeNumber === holeNumber);
      if (!result) return { holeNumber, result: null, mark: null, running: null };

      if (result.winner === "player1") running++;
      else if (result.winner === "player2") running--;

      return {
        holeNumber,
        result,
        mark:
          result.winner === "player1"
            ? "W"
            : result.winner === "player2"
            ? "L"
            : "H",
        running,
      };
    }
  );

  // A gross score, with a dot marking a hole where that player got a stroke
  function scoreCell(gross: number | undefined, strokes: number | undefined) {
    if (gross === undefined) {
      return <span className="text-muted-foreground">–</span>;
    }
    return (
      <span className="relative">
        {gross}
        {!!strokes && strokes > 0 && (
          <span
            className="absolute -top-0.5 -right-1.5 text-orange-500 leading-none"
            title={`${strokes} handicap stroke${strokes > 1 ? "s" : ""}`}
          >
            •
          </span>
        )}
      </span>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="w-12 text-left font-normal">Hole</th>
            {cells.map((cell) => (
              <th key={cell.holeNumber} className="font-normal text-center">
                {cell.holeNumber}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="max-w-12 truncate text-muted-foreground">
              {player1Name}
            </td>
            {cells.map((cell) => (
              <td key={cell.holeNumber} className="text-center py-0.5">
                {scoreCell(
                  cell.result?.player1Gross,
                  cell.result?.player1StrokesReceived
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td className="max-w-12 truncate text-muted-foreground">
              {player2Name}
            </td>
            {cells.map((cell) => (
              <td key={cell.holeNumber} className="text-center py-0.5">
                {scoreCell(
                  cell.result?.player2Gross,
                  cell.result?.player2StrokesReceived
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td></td>
            {cells.map((cell) => (
              <td key={cell.holeNumber} className="px-0.5 pt-1">
                <div
                  className={cn(
                    "rounded py-0.5 text-center font-bold",
                    cell.mark === "W" && "bg-green-100 text-green-700",
                    cell.mark === "L" && "bg-red-100 text-red-700",
                    cell.mark === "H" && "bg-muted text-foreground",
                    !cell.mark && "bg-muted/30 text-muted-foreground"
                  )}
                >
                  {cell.mark ?? "–"}
                </div>
              </td>
            ))}
          </tr>
          <tr className="text-[10px] text-muted-foreground">
            <td></td>
            {cells.map((cell) => (
              <td key={cell.holeNumber} className="text-center">
                {cell.running === null
                  ? ""
                  : cell.running === 0
                  ? "AS"
                  : cell.running > 0
                  ? `+${cell.running}`
                  : cell.running}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface Hole {
  id: string;
  holeNumber: number;
  par: number;
  handicap: number;
}

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
  isManual: boolean;
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

interface Round {
  id: string;
  status: string;
  betAmount: string;
  handicapMode: string;
  autoPressAt2: boolean;
  ninesEnabled: boolean;
  ninesPointValue: string;
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

export default function PlayRoundPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { toast } = useToast();
  const [round, setRound] = useState<Round | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<Record<string, Record<number, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("scorecard");
  const [showNet, setShowNet] = useState(false);
  const [pendingPress, setPendingPress] = useState<string | null>(null);
  const [expandedMatches, setExpandedMatches] = useState<string[]>([]);

  function toggleMatchExpanded(matchId: string) {
    setExpandedMatches((prev) =>
      prev.includes(matchId)
        ? prev.filter((m) => m !== matchId)
        : [...prev, matchId]
    );
  }

  // Calculate course handicap for a player
  function getPlayerCourseHandicap(playerId: string): number {
    if (!round) return 0;
    const player = round.players.find(p => p.id === playerId);
    if (!player) return 0;

    const handicapIndex = parseFloat(player.handicap);
    const coursePar = round.course.holes.reduce((sum, h) => sum + h.par, 0);
    const courseRating = round.course.rating ? parseFloat(round.course.rating) : null;

    return calculateCourseHandicap(handicapIndex, round.course.slope, courseRating, coursePar);
  }

  // Calculate strokes received for a player on a hole
  function getPlayerStrokesOnHole(playerId: string, holeNumber: number): number {
    if (!round) return 0;
    const player = round.players.find(p => p.id === playerId);
    if (!player) return 0;

    const hole = round.course.holes.find(h => h.holeNumber === holeNumber);
    if (!hole) return 0;

    // Use course handicap instead of raw handicap index
    const playerCourseHcp = getPlayerCourseHandicap(playerId);
    const allCourseHandicaps = round.players.map(p => getPlayerCourseHandicap(p.id));
    const groupLowest = Math.min(...allCourseHandicaps);

    if (round.handicapMode === "GROUP_LOWEST") {
      return getStrokesOnHole(playerCourseHcp, groupLowest, hole.handicap, "GROUP_LOWEST", groupLowest);
    }
    // For MATCH_LOWEST, we'd need to know the opponent - show strokes off group lowest as approximation
    return getStrokesOnHole(playerCourseHcp, groupLowest, hole.handicap, "GROUP_LOWEST", groupLowest);
  }

  useEffect(() => {
    fetchRound();
  }, [id]);

  async function fetchRound() {
    const response = await fetch(`/api/rounds/${id}`);
    if (response.ok) {
      const data = await response.json();
      setRound(data.round);

      // Initialize scores from saved data only — leave unplayed holes empty
      const initialScores: Record<string, Record<number, string>> = {};
      for (const player of data.round.players) {
        initialScores[player.id] = {};
        for (const score of player.scores) {
          initialScores[player.id][score.holeNumber] = score.grossStrokes.toString();
        }
      }
      setScores(initialScores);

      // Find first hole without saved scores (check actual DB records, not pre-filled par)
      for (let h = 1; h <= 18; h++) {
        const allScored = data.round.players.every(
          (p: RoundPlayer) => p.scores.some((s: { holeNumber: number }) => s.holeNumber === h)
        );
        if (!allScored) {
          setCurrentHole(h);
          break;
        }
      }
    }
  }

  // Hole-by-hole results for a match, decided the same way the API decides the
  // match status it stores
  function matchHoleResults(match: Match): HoleResult[] {
    if (!round) return [];

    return buildMatchHoleResults(
      round.course.holes,
      round.handicapMode === "MATCH_LOWEST" ? "MATCH_LOWEST" : "GROUP_LOWEST",
      {
        courseHandicap: getPlayerCourseHandicap(match.player1.id),
        scores: match.player1.scores,
      },
      {
        courseHandicap: getPlayerCourseHandicap(match.player2.id),
        scores: match.player2.scores,
      }
    );
  }

  // Which of a match's three Nassau bets can be pressed right now
  function matchPressOpportunities(match: Match): PressOpportunity[] {
    if (!round || round.status === "COMPLETED") return [];

    // The press starts on the hole after the last one both players have scored
    let lastScoredHole = 0;
    for (let hole = 1; hole <= 18; hole++) {
      const p1Scored = match.player1.scores.some((s) => s.holeNumber === hole);
      const p2Scored = match.player2.scores.some((s) => s.holeNumber === hole);
      if (p1Scored && p2Scored) lastScoredHole = hole;
    }

    const bets: PressBet[] = [
      ...match.results.map((result) => ({
        segment: result.segment as MatchSegment,
        startHole: getSegmentStartHole(result.segment as MatchSegment),
        player1Status: result.player1Status,
        isClosed: result.isClosed,
      })),
      ...match.presses.map((press) => ({
        segment: press.segment as MatchSegment,
        startHole: press.startHole,
        player1Status: press.player1Status,
        isClosed: press.isClosed,
      })),
    ];

    return getPressOpportunities(
      bets,
      lastScoredHole,
      match.player1.id,
      match.player2.id
    );
  }

  async function takePress(match: Match, opportunity: PressOpportunity) {
    const key = `${match.id}:${opportunity.segment}`;
    setPendingPress(key);
    try {
      const response = await fetch(
        `/api/rounds/${id}/matches/${match.id}/press`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segment: opportunity.segment }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to press");
      }

      toast({
        title: `${SEGMENT_LABELS[opportunity.segment]} pressed`,
        description: `New bet from hole ${opportunity.startHole}`,
      });
      await fetchRound();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to press",
        variant: "destructive",
      });
    } finally {
      setPendingPress(null);
    }
  }

  async function undoPress(match: Match, pressId: string) {
    setPendingPress(pressId);
    try {
      const response = await fetch(
        `/api/rounds/${id}/matches/${match.id}/press?pressId=${pressId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to remove press");
      }

      toast({ title: "Press removed" });
      await fetchRound();
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove press",
        variant: "destructive",
      });
    } finally {
      setPendingPress(null);
    }
  }

  function updateScore(playerId: string, holeNumber: number, value: string) {
    setScores((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [holeNumber]: value,
      },
    }));
  }

  async function saveScores() {
    if (!round) return;

    // Fill empty scores up to currentHole with par before saving
    const filledScores = { ...scores };
    for (const player of round.players) {
      for (let hole = 1; hole <= currentHole; hole++) {
        if (!filledScores[player.id]?.[hole]) {
          const par = round.course.holes.find((h) => h.holeNumber === hole)?.par ?? 4;
          filledScores[player.id] = { ...filledScores[player.id], [hole]: par.toString() };
        }
      }
    }
    setScores(filledScores);

    setIsSaving(true);
    try {
      const scoreInputs = [];
      for (const player of round.players) {
        for (let hole = 1; hole <= 18; hole++) {
          const scoreValue = filledScores[player.id]?.[hole];
          if (scoreValue && scoreValue !== "") {
            scoreInputs.push({
              roundPlayerId: player.id,
              holeNumber: hole,
              grossStrokes: parseInt(scoreValue),
            });
          }
        }
      }

      const response = await fetch(`/api/rounds/${id}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: scoreInputs }),
      });

      if (!response.ok) {
        throw new Error("Failed to save scores");
      }

      toast({ title: "Scores saved!" });
      fetchRound(); // Refresh to get updated match states
    } catch {
      toast({
        title: "Error",
        description: "Failed to save scores",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function saveCurrentHoleAndAdvance() {
    saveScores();
    if (currentHole < 18) {
      setCurrentHole(currentHole + 1);
    }
  }

  if (!round) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading round...</p>
      </div>
    );
  }

  const currentHoleData = round.course.holes.find((h) => h.holeNumber === currentHole);
  const allCurrentHoleScored = round.players.every(
    (p) => scores[p.id]?.[currentHole] && scores[p.id][currentHole] !== ""
  );
  const pressOpportunitiesByMatch = new Map(
    round.matches.map((match) => [match.id, matchPressOpportunities(match)])
  );
  const availablePressCount = Array.from(
    pressOpportunitiesByMatch.values()
  ).reduce((sum, opportunities) => sum + opportunities.length, 0);

  // Calculate 9s game state if enabled (3 or 4 players)
  const ninesState: NinesState | null = round.ninesEnabled && (round.players.length === 3 || round.players.length === 4)
    ? (() => {
        const holeScores: { holeNumber: number; scores: { playerId: string; netScore: number }[] }[] = [];

        for (let hole = 1; hole <= 18; hole++) {
          // Check if all 3 players have scored this hole
          const allScored = round.players.every(
            (p) => p.scores.some((s) => s.holeNumber === hole)
          );

          if (allScored) {
            const holeData = round.course.holes.find((h) => h.holeNumber === hole);
            const holeHcp = holeData?.handicap || 18;

            holeScores.push({
              holeNumber: hole,
              scores: round.players.map((p) => {
                const score = p.scores.find((s) => s.holeNumber === hole);
                const grossStrokes = score?.grossStrokes || 0;
                const strokesReceived = getPlayerStrokesOnHole(p.id, hole);
                const netScore = grossStrokes - strokesReceived;
                return { playerId: p.id, netScore };
              }),
            });
          }
        }

        return calculateNinesState(holeScores);
      })()
    : null;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="font-bold">{round.course.name}</h2>
            <p className="text-xs text-muted-foreground">
              ${round.betAmount} Nassau
            </p>
          </div>
        </div>
        <Button onClick={saveScores} disabled={isSaving} size="sm">
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={cn("grid w-full", round.ninesEnabled ? "grid-cols-4" : "grid-cols-3")}>
          <TabsTrigger value="hole">Hole</TabsTrigger>
          <TabsTrigger value="scorecard">Card</TabsTrigger>
          <TabsTrigger value="matches">
            Matches
            {availablePressCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                {availablePressCount}
              </span>
            )}
          </TabsTrigger>
          {round.ninesEnabled && <TabsTrigger value="nines">9s</TabsTrigger>}
        </TabsList>

        {/* Single Hole Entry */}
        <TabsContent value="hole" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={currentHole === 1}
                  onClick={() => setCurrentHole(currentHole - 1)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="text-center">
                  <CardTitle className="text-3xl">Hole {currentHole}</CardTitle>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <span>Par {currentHoleData?.par}</span>
                    <span>·</span>
                    <span>HCP {currentHoleData?.handicap}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={currentHole === 18}
                  onClick={() => setCurrentHole(currentHole + 1)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {round.players.map((player) => {
                const score = scores[player.id]?.[currentHole] || "";
                const par = currentHoleData?.par || 4;
                const scoreNum = parseInt(score);
                const diff = scoreNum ? scoreNum - par : null;

                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                      {player.player.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{player.player.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Index: {parseFloat(player.handicap).toFixed(1)} → Course: {getPlayerCourseHandicap(player.id)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() =>
                          updateScore(
                            player.id,
                            currentHole,
                            Math.max(1, (parseInt(score) || par) - 1).toString()
                          )
                        }
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        value={score}
                        onChange={(e) =>
                          updateScore(player.id, currentHole, e.target.value)
                        }
                        className={cn(
                          "w-14 h-10 text-center text-lg font-bold",
                          diff !== null && diff < 0 && "text-red-600",
                          diff !== null && diff > 0 && "text-blue-600"
                        )}
                        placeholder={par.toString()}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() =>
                          updateScore(
                            player.id,
                            currentHole,
                            ((parseInt(score) || par) + 1).toString()
                          )
                        }
                      >
                        +
                      </Button>
                    </div>
                  </div>
                );
              })}

              <Button
                onClick={saveCurrentHoleAndAdvance}
                className="w-full"
                disabled={!allCurrentHoleScored || isSaving}
              >
                {currentHole === 18 ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Finish Round
                  </>
                ) : (
                  <>
                    Next Hole
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Full Scorecard */}
        <TabsContent value="scorecard">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Scorecard</CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor="show-net" className="text-sm">Net</Label>
                  <Switch
                    id="show-net"
                    checked={showNet}
                    onCheckedChange={setShowNet}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium sticky left-0 bg-muted/50">
                      Hole
                    </th>
                    {round.course.holes.slice(0, 9).map((hole) => (
                      <th
                        key={hole.holeNumber}
                        className={cn(
                          "p-2 text-center font-medium min-w-[40px]",
                          currentHole === hole.holeNumber && "bg-primary/10"
                        )}
                        onClick={() => {
                          setCurrentHole(hole.holeNumber);
                          setActiveTab("hole");
                        }}
                      >
                        {hole.holeNumber}
                      </th>
                    ))}
                    <th className="p-2 text-center font-medium bg-muted">Out</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b text-muted-foreground text-xs">
                    <td className="p-2 sticky left-0 bg-background">Par</td>
                    {round.course.holes.slice(0, 9).map((hole) => (
                      <td key={hole.holeNumber} className="p-2 text-center">
                        {hole.par}
                      </td>
                    ))}
                    <td className="p-2 text-center bg-muted/50">
                      {round.course.holes.slice(0, 9).reduce((s, h) => s + h.par, 0)}
                    </td>
                  </tr>
                  <tr className="border-b text-muted-foreground text-xs">
                    <td className="p-2 sticky left-0 bg-background">HCP</td>
                    {round.course.holes.slice(0, 9).map((hole) => (
                      <td key={hole.holeNumber} className="p-2 text-center">
                        {hole.handicap}
                      </td>
                    ))}
                    <td className="p-2 text-center bg-muted/50"></td>
                  </tr>
                  {round.players.map((player) => {
                    const frontScores = round.course.holes.slice(0, 9).map((h) => {
                      const s = scores[player.id]?.[h.holeNumber];
                      return s ? parseInt(s) : null;
                    });
                    const frontTotal = frontScores.reduce(
                      (sum, s) => (s !== null ? sum! + s : sum),
                      0 as number | null
                    );
                    const frontNetTotal = round.course.holes.slice(0, 9).reduce((sum, h) => {
                      const s = scores[player.id]?.[h.holeNumber];
                      if (!s) return sum;
                      const strokes = getPlayerStrokesOnHole(player.id, h.holeNumber);
                      return sum + parseInt(s) - strokes;
                    }, 0);

                    return (
                      <tr key={player.id} className="border-b">
                        <td className="p-2 font-medium sticky left-0 bg-background">
                          {player.player.name.split(" ")[0]}
                        </td>
                        {round.course.holes.slice(0, 9).map((hole) => {
                          const score = scores[player.id]?.[hole.holeNumber];
                          const scoreNum = score ? parseInt(score) : null;
                          const strokesOnHole = getPlayerStrokesOnHole(player.id, hole.holeNumber);
                          const netScore = scoreNum ? scoreNum - strokesOnHole : null;
                          const displayScore = showNet ? netScore : scoreNum;
                          const diff = displayScore ? displayScore - hole.par : null;

                          return (
                            <td
                              key={hole.holeNumber}
                              className={cn(
                                "p-2 text-center relative",
                                currentHole === hole.holeNumber && "bg-primary/10",
                                diff !== null && diff <= -2 && "text-yellow-600 font-bold",
                                diff !== null && diff === -1 && "text-red-600",
                                diff !== null && diff === 1 && "text-blue-600",
                                diff !== null && diff >= 2 && "text-blue-800 font-bold"
                              )}
                              onClick={() => {
                                setCurrentHole(hole.holeNumber);
                                setActiveTab("hole");
                              }}
                            >
                              {strokesOnHole > 0 && (
                                <span className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full" title={`${strokesOnHole} stroke${strokesOnHole > 1 ? 's' : ''}`}></span>
                              )}
                              {displayScore || "-"}
                            </td>
                          );
                        })}
                        <td className="p-2 text-center font-medium bg-muted/50">
                          {showNet ? (frontNetTotal || "-") : (frontTotal || "-")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Back 9 */}
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium sticky left-0 bg-muted/50">
                      Hole
                    </th>
                    {round.course.holes.slice(9, 18).map((hole) => (
                      <th
                        key={hole.holeNumber}
                        className={cn(
                          "p-2 text-center font-medium min-w-[40px]",
                          currentHole === hole.holeNumber && "bg-primary/10"
                        )}
                        onClick={() => {
                          setCurrentHole(hole.holeNumber);
                          setActiveTab("hole");
                        }}
                      >
                        {hole.holeNumber}
                      </th>
                    ))}
                    <th className="p-2 text-center font-medium bg-muted">In</th>
                    <th className="p-2 text-center font-medium bg-muted">Tot</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b text-muted-foreground text-xs">
                    <td className="p-2 sticky left-0 bg-background">Par</td>
                    {round.course.holes.slice(9, 18).map((hole) => (
                      <td key={hole.holeNumber} className="p-2 text-center">
                        {hole.par}
                      </td>
                    ))}
                    <td className="p-2 text-center bg-muted/50">
                      {round.course.holes.slice(9, 18).reduce((s, h) => s + h.par, 0)}
                    </td>
                    <td className="p-2 text-center bg-muted/50">
                      {round.course.holes.reduce((s, h) => s + h.par, 0)}
                    </td>
                  </tr>
                  <tr className="border-b text-muted-foreground text-xs">
                    <td className="p-2 sticky left-0 bg-background">HCP</td>
                    {round.course.holes.slice(9, 18).map((hole) => (
                      <td key={hole.holeNumber} className="p-2 text-center">
                        {hole.handicap}
                      </td>
                    ))}
                    <td className="p-2 text-center bg-muted/50"></td>
                    <td className="p-2 text-center bg-muted/50"></td>
                  </tr>
                  {round.players.map((player) => {
                    const frontScores = round.course.holes.slice(0, 9).map((h) => {
                      const s = scores[player.id]?.[h.holeNumber];
                      return s ? parseInt(s) : null;
                    });
                    const frontTotal = frontScores.reduce(
                      (sum, s) => (s !== null ? sum! + s : sum),
                      0 as number | null
                    );
                    const frontNetTotal = round.course.holes.slice(0, 9).reduce((sum, h) => {
                      const s = scores[player.id]?.[h.holeNumber];
                      if (!s) return sum;
                      const strokes = getPlayerStrokesOnHole(player.id, h.holeNumber);
                      return sum + parseInt(s) - strokes;
                    }, 0);

                    const backScores = round.course.holes.slice(9, 18).map((h) => {
                      const s = scores[player.id]?.[h.holeNumber];
                      return s ? parseInt(s) : null;
                    });
                    const backTotal = backScores.reduce(
                      (sum, s) => (s !== null ? sum! + s : sum),
                      0 as number | null
                    );
                    const backNetTotal = round.course.holes.slice(9, 18).reduce((sum, h) => {
                      const s = scores[player.id]?.[h.holeNumber];
                      if (!s) return sum;
                      const strokes = getPlayerStrokesOnHole(player.id, h.holeNumber);
                      return sum + parseInt(s) - strokes;
                    }, 0);

                    return (
                      <tr key={player.id} className="border-b">
                        <td className="p-2 font-medium sticky left-0 bg-background">
                          {player.player.name.split(" ")[0]}
                        </td>
                        {round.course.holes.slice(9, 18).map((hole) => {
                          const score = scores[player.id]?.[hole.holeNumber];
                          const scoreNum = score ? parseInt(score) : null;
                          const strokesOnHole = getPlayerStrokesOnHole(player.id, hole.holeNumber);
                          const netScore = scoreNum ? scoreNum - strokesOnHole : null;
                          const displayScore = showNet ? netScore : scoreNum;
                          const diff = displayScore ? displayScore - hole.par : null;

                          return (
                            <td
                              key={hole.holeNumber}
                              className={cn(
                                "p-2 text-center relative",
                                currentHole === hole.holeNumber && "bg-primary/10",
                                diff !== null && diff <= -2 && "text-yellow-600 font-bold",
                                diff !== null && diff === -1 && "text-red-600",
                                diff !== null && diff === 1 && "text-blue-600",
                                diff !== null && diff >= 2 && "text-blue-800 font-bold"
                              )}
                              onClick={() => {
                                setCurrentHole(hole.holeNumber);
                                setActiveTab("hole");
                              }}
                            >
                              {strokesOnHole > 0 && (
                                <span className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full" title={`${strokesOnHole} stroke${strokesOnHole > 1 ? 's' : ''}`}></span>
                              )}
                              {displayScore || "-"}
                            </td>
                          );
                        })}
                        <td className="p-2 text-center font-medium bg-muted/50">
                          {showNet ? (backNetTotal || "-") : (backTotal || "-")}
                        </td>
                        <td className="p-2 text-center font-bold bg-muted/50">
                          {showNet
                            ? (frontNetTotal + backNetTotal || "-")
                            : (frontTotal && backTotal ? frontTotal + backTotal : "-")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Match Status */}
        <TabsContent value="matches" className="space-y-3">
          {round.matches.map((match) => {
            const front9 = match.results.find((r) => r.segment === "FRONT_9");
            const back9 = match.results.find((r) => r.segment === "BACK_9");
            const overall = match.results.find((r) => r.segment === "OVERALL_18");
            const opportunities = pressOpportunitiesByMatch.get(match.id) ?? [];
            const isExpanded = expandedMatches.includes(match.id);
            const holeResults = isExpanded ? matchHoleResults(match) : [];
            const won = holeResults.filter((h) => h.winner === "player1").length;
            const lost = holeResults.filter((h) => h.winner === "player2").length;
            const halved = holeResults.filter((h) => h.winner === "tie").length;
            const statusThroughNow = won - lost;

            return (
              <Card key={match.id}>
                <CardHeader
                  className="pb-2 cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleMatchExpanded(match.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleMatchExpanded(match.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-1">
                      {match.player1.player.name.split(" ")[0]} vs{" "}
                      {match.player2.player.name.split(" ")[0]}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </CardTitle>
                    {match.strokeDifference > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {match.strokeDifference} strokes
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">Front 9</p>
                      <p
                        className={cn(
                          "font-bold",
                          front9 && front9.player1Status > 0 && "text-green-600",
                          front9 && front9.player1Status < 0 && "text-red-600"
                        )}
                      >
                        {front9 ? formatMatchStatus(front9.player1Status) : "-"}
                      </p>
                      {front9?.isClosed && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          Closed
                        </Badge>
                      )}
                    </div>
                    <div className="p-2 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">Back 9</p>
                      <p
                        className={cn(
                          "font-bold",
                          back9 && back9.player1Status > 0 && "text-green-600",
                          back9 && back9.player1Status < 0 && "text-red-600"
                        )}
                      >
                        {back9 ? formatMatchStatus(back9.player1Status) : "-"}
                      </p>
                      {back9?.isClosed && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          Closed
                        </Badge>
                      )}
                    </div>
                    <div className="p-2 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">Overall</p>
                      <p
                        className={cn(
                          "font-bold",
                          overall && overall.player1Status > 0 && "text-green-600",
                          overall && overall.player1Status < 0 && "text-red-600"
                        )}
                      >
                        {overall ? formatMatchStatus(overall.player1Status) : "-"}
                      </p>
                      {overall?.isClosed && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          Closed
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Hole by hole, from the first player's point of view */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      {holeResults.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No holes scored yet
                        </p>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <p className="text-sm">
                              <span className="font-medium">
                                {match.player1.player.name.split(" ")[0]}
                              </span>{" "}
                              <span
                                className={cn(
                                  "font-bold",
                                  statusThroughNow > 0 && "text-green-600",
                                  statusThroughNow < 0 && "text-red-600"
                                )}
                              >
                                {formatMatchStatus(statusThroughNow)}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                after {holeResults.length}{" "}
                                {holeResults.length === 1 ? "hole" : "holes"}
                              </span>
                            </p>
                            <p className="text-xs tabular-nums">
                              <span className="text-green-600">{won} won</span>
                              {" · "}
                              <span className="text-red-600">{lost} lost</span>
                              {" · "}
                              <span className="text-muted-foreground">
                                {halved} halved
                              </span>
                            </p>
                          </div>
                          <HoleStrip
                            label="Front 9"
                            startHole={1}
                            holeResults={holeResults}
                            player1Name={match.player1.player.name.split(" ")[0]}
                            player2Name={match.player2.player.name.split(" ")[0]}
                          />
                          {holeResults.some((h) => h.holeNumber > 9) && (
                            <HoleStrip
                              label="Back 9"
                              startHole={10}
                              holeResults={holeResults}
                              player1Name={match.player1.player.name.split(" ")[0]}
                              player2Name={match.player2.player.name.split(" ")[0]}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Available presses — any bet where a player is 2+ down */}
                  {opportunities.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {opportunities.map((opportunity) => {
                        const downPlayer =
                          opportunity.downPlayerId === match.player1.id
                            ? match.player1
                            : match.player2;
                        const key = `${match.id}:${opportunity.segment}`;

                        return (
                          <Button
                            key={key}
                            variant="outline"
                            size="sm"
                            disabled={pendingPress === key}
                            onClick={() => takePress(match, opportunity)}
                            className="w-full justify-between border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                          >
                            <span className="flex items-center gap-1.5 font-medium">
                              <Zap className="h-3.5 w-3.5" />
                              Press {SEGMENT_LABELS[opportunity.segment]}
                            </span>
                            <span className="text-xs font-normal">
                              {downPlayer.player.name.split(" ")[0]}{" "}
                              {opportunity.downBy} DN · from {opportunity.startHole}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* Presses */}
                  {match.presses.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">
                        Presses
                      </p>
                      <div className="space-y-1">
                        {[...match.presses]
                          .sort((a, b) => a.startHole - b.startHole)
                          .map((press, idx) => (
                            <div
                              key={press.id || idx}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="flex items-center gap-1.5">
                                From hole {press.startHole} (
                                {SEGMENT_SHORT_LABELS[press.segment] ?? press.segment})
                                {!press.isManual && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Auto
                                  </Badge>
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "font-medium",
                                    press.player1Status > 0 && "text-green-600",
                                    press.player1Status < 0 && "text-red-600"
                                  )}
                                >
                                  {formatMatchStatus(press.player1Status)}
                                </span>
                                {press.isManual && round.status !== "COMPLETED" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground"
                                    disabled={pendingPress === press.id}
                                    onClick={() => undoPress(match, press.id)}
                                    aria-label="Remove press"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push(`/rounds/${id}/results`)}
          >
            View Full Results
          </Button>
        </TabsContent>

        {/* 9s Game */}
        {round.ninesEnabled && ninesState && (
          <TabsContent value="nines" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">9s Game</CardTitle>
                  <Badge variant="outline">${round.ninesPointValue}/pt</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {/* Front 9 */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium sticky left-0 bg-muted/50">Hole</th>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((hole) => (
                        <th key={hole} className="p-2 text-center font-medium min-w-[36px]">{hole}</th>
                      ))}
                      <th className="p-2 text-center font-medium bg-muted">Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.players.map((player) => {
                      const frontTotal = ninesState.holeResults
                        .filter((h) => h.holeNumber <= 9)
                        .reduce((sum, h) => {
                          const pts = h.points.find((p) => p.playerId === player.id);
                          return sum + (pts?.points || 0);
                        }, 0);

                      return (
                        <tr key={player.id} className="border-b">
                          <td className="p-2 font-medium sticky left-0 bg-background">
                            {player.player.name.split(" ")[0]}
                          </td>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((holeNum) => {
                            const holeResult = ninesState.holeResults.find((h) => h.holeNumber === holeNum);
                            if (!holeResult) {
                              return <td key={holeNum} className="p-2 text-center text-muted-foreground">-</td>;
                            }
                            const playerPts = holeResult.points.find((p) => p.playerId === player.id);
                            const pts = playerPts?.points || 0;

                            return (
                              <td
                                key={holeNum}
                                className={cn(
                                  "p-2 text-center",
                                  holeResult.isCarryover && "text-yellow-600 font-medium",
                                  pts >= 5 && !holeResult.isCarryover && "text-green-600 font-bold",
                                  pts === 1 && !holeResult.isCarryover && "text-red-600"
                                )}
                              >
                                {formatHolePoints(pts, holeResult.isCarryover)}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center font-medium bg-muted/50">{frontTotal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Back 9 */}
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium sticky left-0 bg-muted/50">Hole</th>
                      {[10, 11, 12, 13, 14, 15, 16, 17, 18].map((hole) => (
                        <th key={hole} className="p-2 text-center font-medium min-w-[36px]">{hole}</th>
                      ))}
                      <th className="p-2 text-center font-medium bg-muted">In</th>
                      <th className="p-2 text-center font-medium bg-muted">Tot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.players.map((player) => {
                      const backTotal = ninesState.holeResults
                        .filter((h) => h.holeNumber > 9)
                        .reduce((sum, h) => {
                          const pts = h.points.find((p) => p.playerId === player.id);
                          return sum + (pts?.points || 0);
                        }, 0);

                      const totalPts = ninesState.totalPoints.find((p) => p.playerId === player.id)?.points || 0;

                      return (
                        <tr key={player.id} className="border-b">
                          <td className="p-2 font-medium sticky left-0 bg-background">
                            {player.player.name.split(" ")[0]}
                          </td>
                          {[10, 11, 12, 13, 14, 15, 16, 17, 18].map((holeNum) => {
                            const holeResult = ninesState.holeResults.find((h) => h.holeNumber === holeNum);
                            if (!holeResult) {
                              return <td key={holeNum} className="p-2 text-center text-muted-foreground">-</td>;
                            }
                            const playerPts = holeResult.points.find((p) => p.playerId === player.id);
                            const pts = playerPts?.points || 0;

                            return (
                              <td
                                key={holeNum}
                                className={cn(
                                  "p-2 text-center",
                                  holeResult.isCarryover && "text-yellow-600 font-medium",
                                  pts >= 5 && !holeResult.isCarryover && "text-green-600 font-bold",
                                  pts === 1 && !holeResult.isCarryover && "text-red-600"
                                )}
                              >
                                {formatHolePoints(pts, holeResult.isCarryover)}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center font-medium bg-muted/50">{backTotal}</td>
                          <td className="p-2 text-center font-bold bg-muted/50">{totalPts}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Running Settlement */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Running Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ninesState.totalPoints.map((p) => {
                    const player = round.players.find((rp) => rp.id === p.playerId);
                    const totalPointsAwarded = ninesState.totalPoints.reduce((sum, tp) => sum + tp.points, 0);
                    const averagePoints = totalPointsAwarded / 3;
                    const netPoints = p.points - averagePoints;
                    const money = netPoints * parseFloat(round.ninesPointValue);

                    return (
                      <div key={p.playerId} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                            {player?.player.name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                          </div>
                          <span className="font-medium">{player?.player.name.split(" ")[0]}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{p.points} pts</p>
                          <p className={cn(
                            "text-sm",
                            money > 0 && "text-green-600",
                            money < 0 && "text-red-600"
                          )}>
                            {money >= 0 ? "+" : ""}{money.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {ninesState.pendingCarryover > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-yellow-600 font-medium">
                      {ninesState.pendingCarryover} points pending carryover
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
