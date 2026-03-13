"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn, formatMatchStatus, getStrokesOnHole, calculateCourseHandicap } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { calculateNinesState, formatHolePoints, type NinesState } from "@/lib/games/nines";

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

    setIsSaving(true);
    try {
      const scoreInputs = [];
      for (const player of round.players) {
        for (let hole = 1; hole <= 18; hole++) {
          const scoreValue = scores[player.id]?.[hole];
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
          <TabsTrigger value="matches">Matches</TabsTrigger>
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

            return (
              <Card key={match.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {match.player1.player.name.split(" ")[0]} vs{" "}
                      {match.player2.player.name.split(" ")[0]}
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

                  {/* Presses */}
                  {match.presses.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">
                        Presses
                      </p>
                      <div className="space-y-1">
                        {match.presses.map((press, idx) => (
                          <div
                            key={press.id || idx}
                            className="flex items-center justify-between text-sm"
                          >
                            <span>
                              From hole {press.startHole} (
                              {press.segment === "FRONT_9" ? "F9" : "B9"})
                            </span>
                            <span
                              className={cn(
                                "font-medium",
                                press.player1Status > 0 && "text-green-600",
                                press.player1Status < 0 && "text-red-600"
                              )}
                            >
                              {formatMatchStatus(press.player1Status)}
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
