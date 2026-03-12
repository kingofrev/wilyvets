"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  Share2,
  Check,
  Trophy,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { formatScore, tierLabel } from "@/lib/games/majors"

interface Golfer {
  id: string
  name: string
  tier: number
  odds: number
  r1Score: number | null
  r2Score: number | null
  r3Score: number | null
  r4Score: number | null
  totalScore: number | null
  position: string | null
  isCut: boolean
  isWithdrawn: boolean
}

interface Pick {
  tier: number
  golfer: Golfer
  isDropped: boolean
}

interface Entry {
  id: string
  entrantName: string
  email: string | null
  picks: Pick[]
  winnerPick: Golfer | null
  tiebreaker: number | null
  totalScore: number | null
  rank: number | null
}

interface Tournament {
  id: string
  name: string
  type: string
  year: number
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED"
  espnLeague: string
  espnEventId: string | null
  oddsApiSportKey: string | null
  oddsUpdatedAt: string | null
  scoresUpdatedAt: string | null
  golfers: Golfer[]
  entries: Entry[]
}

const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Picks Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">-</span>
  const cls =
    score < 0 ? "text-red-600 font-medium" : score > 0 ? "text-blue-600" : "text-muted-foreground"
  return <span className={cls}>{formatScore(score)}</span>
}

export default function MajorsTournamentPage() {
  const params = useParams()
  const { toast } = useToast()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchingOdds, setFetchingOdds] = useState(false)
  const [fetchingScores, setFetchingScores] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"leaderboard" | "field">("leaderboard")

  const load = useCallback(async () => {
    const res = await fetch(`/api/majors/${params.id}`)
    if (res.ok) {
      const d = await res.json()
      setTournament(d.tournament)
    }
    setLoading(false)
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  async function fetchOdds() {
    setFetchingOdds(true)
    try {
      const res = await fetch(`/api/majors/${params.id}/fetch-odds`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast({ title: "Odds loaded!", description: d.message })
      load()
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to fetch odds",
        variant: "destructive",
      })
    } finally {
      setFetchingOdds(false)
    }
  }

  async function fetchScores() {
    setFetchingScores(true)
    try {
      const res = await fetch(`/api/majors/${params.id}/fetch-scores`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast({ title: "Scores updated!", description: `Updated ${d.updated} of ${d.total} golfers.` })
      load()
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to fetch scores",
        variant: "destructive",
      })
    } finally {
      setFetchingScores(false)
    }
  }

  async function setStatus(status: string) {
    await fetch(`/api/majors/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    load()
  }

  function copyShareLink() {
    const url = `${window.location.origin}/majors/${params.id}/enter`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
  if (!tournament) return <p className="text-destructive py-8 text-center">Tournament not found.</p>

  const tierGroups = [1, 2, 3, 4, 5, 6].map((tier) => ({
    tier,
    golfers: tournament.golfers.filter((g) => g.tier === tier),
  }))

  const sortedEntries = [...tournament.entries].sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank
    if (a.rank !== null) return -1
    if (b.rank !== null) return 1
    return 0
  })

  // Determine winner-pick winner
  const actualWinner = tournament.golfers
    .filter((g) => !g.isCut && !g.isWithdrawn && g.totalScore !== null)
    .sort((a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0))[0]

  const winnerPickWinners = actualWinner
    ? tournament.entries.filter((e) => e.winnerPick?.id === actualWinner.id)
    : []

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/majors">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate">{tournament.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge
              variant={
                tournament.status === "IN_PROGRESS"
                  ? "default"
                  : tournament.status === "COMPLETED"
                    ? "outline"
                    : "secondary"
              }
            >
              {STATUS_LABEL[tournament.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {tournament.entries.length} {tournament.entries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
        </div>
      </div>

      {/* Admin Controls */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Admin Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchOdds}
              disabled={fetchingOdds}
            >
              <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
              {fetchingOdds ? "Loading..." : "Fetch Odds"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchScores}
              disabled={fetchingScores}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${fetchingScores ? "animate-spin" : ""}`} />
              {fetchingScores ? "Updating..." : "Refresh Scores"}
            </Button>
            <Button size="sm" variant="outline" onClick={copyShareLink}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
              {copied ? "Copied!" : "Share Link"}
            </Button>
            <Link href={`/majors/${params.id}/leaderboard`} target="_blank">
              <Button size="sm" variant="outline">
                Public Leaderboard
              </Button>
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {tournament.status !== "IN_PROGRESS" && (
              <Button size="sm" variant="secondary" onClick={() => setStatus("IN_PROGRESS")}>
                Mark In Progress
              </Button>
            )}
            {tournament.status !== "COMPLETED" && (
              <Button size="sm" variant="secondary" onClick={() => setStatus("COMPLETED")}>
                Mark Completed
              </Button>
            )}
            {tournament.status !== "UPCOMING" && (
              <Button size="sm" variant="ghost" onClick={() => setStatus("UPCOMING")}>
                Reopen Picks
              </Button>
            )}
          </div>

          {tournament.oddsUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              Odds last updated: {new Date(tournament.oddsUpdatedAt).toLocaleString()}
            </p>
          )}
          {tournament.scoresUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              Scores last updated: {new Date(tournament.scoresUpdatedAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Winner Pick Side Bet */}
      {(tournament.status === "IN_PROGRESS" || tournament.status === "COMPLETED") &&
        tournament.entries.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                <Trophy className="h-4 w-4 inline mr-1.5 text-yellow-500" />
                Pick the Winner — ${tournament.entries.length * 5} pot
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actualWinner && tournament.status === "COMPLETED" ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Winner: {actualWinner.name} ({formatScore(actualWinner.totalScore)})
                  </p>
                  {winnerPickWinners.length > 0 ? (
                    <p className="text-sm text-green-600 font-medium">
                      {winnerPickWinners.map((e) => e.entrantName).join(", ")}{" "}
                      {winnerPickWinners.length === 1 ? "wins" : "split"} the pot!
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No one picked the winner.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {tournament.entries.map((e) => (
                    <div key={e.id} className="flex justify-between text-sm">
                      <span>{e.entrantName}</span>
                      <span className="text-muted-foreground">
                        {e.winnerPick?.name ?? "No pick"}
                        {e.winnerPick && ` (+${e.winnerPick.odds})`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {/* Tabs */}
      <div className="flex rounded-lg border overflow-hidden">
        <button
          className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === "leaderboard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
          onClick={() => setActiveTab("leaderboard")}
        >
          Leaderboard
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === "field" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
          onClick={() => setActiveTab("field")}
        >
          Field by Tier
        </button>
      </div>

      {/* Leaderboard Tab */}
      {activeTab === "leaderboard" && (
        <div className="space-y-3">
          {sortedEntries.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No entries yet. Share the link to invite players.
              </CardContent>
            </Card>
          )}
          {sortedEntries.map((entry) => {
            const isExpanded = expandedEntry === entry.id
            return (
              <Card key={entry.id} className="overflow-hidden">
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                >
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground w-6 text-center">
                          {entry.rank ?? "-"}
                        </span>
                        <div>
                          <p className="font-medium">{entry.entrantName}</p>
                          <p className="text-xs text-muted-foreground">
                            TB: {entry.tiebreaker !== null ? formatScore(entry.tiebreaker) : "-"}
                            {entry.winnerPick && ` · Winner: ${entry.winnerPick.name}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold">
                          <ScoreCell score={entry.totalScore} />
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </button>

                {isExpanded && (
                  <div className="border-t bg-muted/20">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="px-3 py-1.5 text-left">Tier</th>
                          <th className="px-3 py-1.5 text-left">Golfer</th>
                          <th className="px-3 py-1.5 text-right">Pos</th>
                          <th className="px-3 py-1.5 text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.picks
                          .sort((a, b) => a.tier - b.tier)
                          .map((pick) => (
                            <tr
                              key={pick.tier}
                              className={`border-b last:border-0 ${pick.isDropped ? "opacity-40" : ""}`}
                            >
                              <td className="px-3 py-1.5 text-muted-foreground">T{pick.tier}</td>
                              <td className="px-3 py-1.5">
                                {pick.golfer.name}
                                {pick.isDropped && (
                                  <span className="ml-1 text-xs text-muted-foreground">(dropped)</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right text-xs">
                                {pick.golfer.position ?? "-"}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <ScoreCell score={pick.golfer.totalScore} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Field by Tier Tab */}
      {activeTab === "field" && (
        <div className="space-y-4">
          {tierGroups.map(({ tier, golfers }) => (
            <Card key={tier}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{tierLabel(tier)}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {golfers.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    No golfers loaded yet. Fetch odds to populate tiers.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="px-3 py-1.5 text-left">Golfer</th>
                        <th className="px-3 py-1.5 text-right">Odds</th>
                        <th className="px-3 py-1.5 text-right">Pos</th>
                        <th className="px-3 py-1.5 text-right">R1</th>
                        <th className="px-3 py-1.5 text-right">R2</th>
                        <th className="px-3 py-1.5 text-right">R3</th>
                        <th className="px-3 py-1.5 text-right">R4</th>
                        <th className="px-3 py-1.5 text-right">Tot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {golfers.map((g) => (
                        <tr
                          key={g.id}
                          className={`border-b last:border-0 ${g.isCut || g.isWithdrawn ? "opacity-50" : ""}`}
                        >
                          <td className="px-3 py-1.5">{g.name}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground text-xs">
                            +{g.odds}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs">{g.position ?? "-"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <ScoreCell score={g.r1Score} />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <ScoreCell score={g.r2Score} />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <ScoreCell score={g.r3Score} />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <ScoreCell score={g.r4Score} />
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium">
                            <ScoreCell score={g.totalScore} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
