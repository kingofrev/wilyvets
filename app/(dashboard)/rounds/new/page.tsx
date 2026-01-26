"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Plus, X, Users } from "lucide-react";
import Link from "next/link";
import { formatHandicap } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  handicap: string | null;
}

interface Course {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

interface SelectedPlayer {
  playerId?: string;
  userId?: string;
  name: string;
  handicap: string;
}

export default function NewRoundPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedPlayers, setSelectedPlayers] = useState<SelectedPlayer[]>([]);
  const [betAmount, setBetAmount] = useState("5");
  const [handicapMode, setHandicapMode] = useState("GROUP_LOWEST");
  const [autoPressAt2, setAutoPressAt2] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/players").then(r => r.json()),
      fetch("/api/courses").then(r => r.json()),
    ]).then(([playersData, coursesData]) => {
      setPlayers(playersData.players || []);
      setCourses(coursesData.courses || []);
    });
  }, []);

  function addPlayer(playerId: string) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    if (selectedPlayers.some(p => p.playerId === playerId)) return;
    if (selectedPlayers.length >= 4) {
      toast({ title: "Max 4 players", description: "Nassau supports up to 4 players", variant: "destructive" });
      return;
    }

    setSelectedPlayers([...selectedPlayers, {
      playerId: player.id,
      name: player.name,
      handicap: player.handicap || "0",
    }]);
  }

  function removePlayer(index: number) {
    setSelectedPlayers(selectedPlayers.filter((_, i) => i !== index));
  }

  function updatePlayerHandicap(index: number, handicap: string) {
    const updated = [...selectedPlayers];
    updated[index].handicap = handicap;
    setSelectedPlayers(updated);
  }

  async function startRound() {
    if (!selectedCourse) {
      toast({ title: "Error", description: "Please select a course", variant: "destructive" });
      return;
    }
    if (selectedPlayers.length < 2) {
      toast({ title: "Error", description: "At least 2 players required", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourse,
          betAmount,
          handicapMode,
          autoPressAt2,
          players: selectedPlayers,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create round");
      }

      const { round } = await response.json();
      toast({ title: "Round Started!", description: "Good luck!" });
      router.push(`/rounds/${round.id}/play`);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start round",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const matchCount = selectedPlayers.length > 1
    ? (selectedPlayers.length * (selectedPlayers.length - 1)) / 2
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">New Round</h2>
          <p className="text-muted-foreground">Set up your Nassau match</p>
        </div>
      </div>

      {/* Course Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Course</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger>
              <SelectValue placeholder="Select a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.name}
                  {course.city && ` - ${course.city}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {courses.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              No courses yet.{" "}
              <Link href="/courses/new" className="text-primary hover:underline">
                Add one first
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Players */}
      <Card>
        <CardHeader>
          <CardTitle>Players ({selectedPlayers.length}/4)</CardTitle>
          <CardDescription>
            {matchCount > 0 && `${matchCount} matches will be created`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selected Players */}
          {selectedPlayers.length > 0 && (
            <div className="space-y-2">
              {selectedPlayers.map((player, index) => (
                <div key={index} className="flex items-center gap-2 p-2 border rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                    {player.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{player.name}</p>
                  </div>
                  <Input
                    type="number"
                    step="0.1"
                    value={player.handicap}
                    onChange={(e) => updatePlayerHandicap(index, e.target.value)}
                    className="w-20 h-8 text-center"
                    placeholder="HCP"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removePlayer(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add Player */}
          {selectedPlayers.length < 4 && (
            <Select onValueChange={addPlayer}>
              <SelectTrigger>
                <SelectValue placeholder="Add a player..." />
              </SelectTrigger>
              <SelectContent>
                {players
                  .filter(p => !selectedPlayers.some(sp => sp.playerId === p.id))
                  .map((player) => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.name} ({formatHandicap(player.handicap)})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          {players.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No players yet.{" "}
              <Link href="/players" className="text-primary hover:underline">
                Add players first
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Bet Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Nassau Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Bet Amount (per bet)</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                × 3 bets = ${(parseFloat(betAmount) || 0) * 3} max per match
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Handicap Mode</Label>
            <Select value={handicapMode} onValueChange={setHandicapMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GROUP_LOWEST">
                  Off lowest in group
                </SelectItem>
                <SelectItem value="MATCH_LOWEST">
                  Off lowest per match
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {handicapMode === "GROUP_LOWEST"
                ? "All players play off the lowest handicap in the foursome"
                : "Each match plays off the lowest handicap between those two players"}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Auto Press at 2 Down</Label>
              <p className="text-xs text-muted-foreground">
                Automatically start a new bet when 2 down
              </p>
            </div>
            <Switch checked={autoPressAt2} onCheckedChange={setAutoPressAt2} />
          </div>
        </CardContent>
      </Card>

      {/* Start Button */}
      <Button
        onClick={startRound}
        className="w-full"
        size="lg"
        disabled={isLoading || !selectedCourse || selectedPlayers.length < 2}
      >
        {isLoading ? "Starting..." : "Start Round"}
      </Button>
    </div>
  );
}
