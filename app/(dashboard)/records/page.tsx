"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
}

interface HeadToHead {
  id: string;
  player1: Player;
  player2: Player;
  player1Wins: number;
  player2Wins: number;
  ties: number;
  player1NetWinnings: number;
  player2NetWinnings: number;
}

interface PlayerStats {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  totalWon: number;
  totalLost: number;
}

export default function RecordsPage() {
  const [records, setRecords] = useState<HeadToHead[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/records")
      .then((r) => r.json())
      .then((data) => {
        setRecords(data.records || []);
        setPlayerStats(data.playerStats || []);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Records</h2>
        <p className="text-muted-foreground">Lifetime stats and head-to-head records</p>
      </div>

      <Tabs defaultValue="leaderboard">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="head-to-head">Head to Head</TabsTrigger>
        </TabsList>

        {/* Leaderboard */}
        <TabsContent value="leaderboard" className="space-y-4">
          {playerStats.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No match history yet. Play some rounds to see stats!
              </CardContent>
            </Card>
          ) : (
            playerStats.map((player, index) => {
              const netWinnings = player.totalWon - player.totalLost;
              const winRate = player.matchesPlayed > 0
                ? ((player.wins / player.matchesPlayed) * 100).toFixed(0)
                : "0";

              return (
                <Card key={player.playerId}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center font-bold text-white",
                          index === 0 && "bg-yellow-500",
                          index === 1 && "bg-gray-400",
                          index === 2 && "bg-amber-700",
                          index > 2 && "bg-muted text-muted-foreground"
                        )}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{player.playerName}</p>
                        <p className="text-sm text-muted-foreground">
                          {player.wins}W - {player.losses}L - {player.ties}T ({winRate}%)
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            "font-bold",
                            netWinnings > 0 && "text-green-600",
                            netWinnings < 0 && "text-red-600"
                          )}
                        >
                          {netWinnings >= 0 ? "+" : ""}
                          {formatCurrency(netWinnings)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {player.matchesPlayed} matches
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Head to Head Records */}
        <TabsContent value="head-to-head" className="space-y-4">
          {records.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No head-to-head records yet. Play some rounds to see stats!
              </CardContent>
            </Card>
          ) : (
            records.map((record) => {
              const totalMatches = record.player1Wins + record.player2Wins + record.ties;
              const p1Leading = record.player1Wins > record.player2Wins;
              const p2Leading = record.player2Wins > record.player1Wins;
              const tied = record.player1Wins === record.player2Wins;

              return (
                <Card key={record.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{record.player1.name}</span>
                      <span className="text-muted-foreground text-sm">vs</span>
                      <span>{record.player2.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            p1Leading && "text-green-600"
                          )}
                        >
                          {record.player1Wins}
                        </p>
                        <p className="text-xs text-muted-foreground">Wins</p>
                        <div
                          className={cn(
                            "mt-2 text-sm font-medium",
                            record.player1NetWinnings > 0 && "text-green-600",
                            record.player1NetWinnings < 0 && "text-red-600"
                          )}
                        >
                          {record.player1NetWinnings >= 0 ? "+" : ""}
                          {formatCurrency(record.player1NetWinnings)}
                        </div>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-muted-foreground">
                          {record.ties}
                        </p>
                        <p className="text-xs text-muted-foreground">Ties</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {totalMatches} matches
                        </p>
                      </div>
                      <div>
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            p2Leading && "text-green-600"
                          )}
                        >
                          {record.player2Wins}
                        </p>
                        <p className="text-xs text-muted-foreground">Wins</p>
                        <div
                          className={cn(
                            "mt-2 text-sm font-medium",
                            record.player2NetWinnings > 0 && "text-green-600",
                            record.player2NetWinnings < 0 && "text-red-600"
                          )}
                        >
                          {record.player2NetWinnings >= 0 ? "+" : ""}
                          {formatCurrency(record.player2NetWinnings)}
                        </div>
                      </div>
                    </div>

                    {!tied && (
                      <div className="mt-3 pt-3 border-t text-center">
                        <Badge variant="outline" className="gap-1">
                          <Trophy className="h-3 w-3" />
                          {p1Leading ? record.player1.name : record.player2.name} leads
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
