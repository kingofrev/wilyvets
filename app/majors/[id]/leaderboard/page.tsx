"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Trophy } from "lucide-react"
import { formatScore, tierLabel } from "@/lib/games/majors"

interface Golfer {
  id: string
  name: string
  tier: number
  odds: number
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
  status: string
  entries: Entry[]
  golfers: Golfer[]
  entryCount: number
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

export default function PublicLeaderboardPage() {
  const params = useParams()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/majors/${params.id}/public`)
      .then((r) => r.json())
      .then((d) => setTournament(d.tournament))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
  if (!tournament) return <p className="text-destructive py-8 text-center">Tournament not found.</p>

  const sortedEntries = [...tournament.entries].sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank
    if (a.rank !== null) return -1
    if (b.rank !== null) return 1
    return 0
  })

  const actualWinner =
    tournament.status === "COMPLETED"
      ? tournament.golfers
          .filter((g) => !g.isCut && !g.isWithdrawn && g.totalScore !== null)
          .sort((a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0))[0]
      : null

  const winnerPickWinners = actualWinner
    ? tournament.entries.filter((e) => e.winnerPick?.id === actualWinner.id)
    : []

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{tournament.name}</h1>
            <Badge
              variant={
                tournament.status === "IN_PROGRESS"
                  ? "default"
                  : tournament.status === "COMPLETED"
                    ? "outline"
                    : "secondary"
              }
            >
              {STATUS_LABEL[tournament.status] ?? tournament.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {tournament.entryCount} {tournament.entryCount === 1 ? "entry" : "entries"}
          </p>
        </div>

        {/* Winner pick result */}
        {tournament.status === "COMPLETED" && actualWinner && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                <Trophy className="h-4 w-4 inline mr-1.5 text-yellow-500" />
                Pick the Winner
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">
                Winner: {actualWinner.name} ({formatScore(actualWinner.totalScore)})
              </p>
              {winnerPickWinners.length > 0 ? (
                <p className="text-green-600 font-medium">
                  {winnerPickWinners.map((e) => e.entrantName).join(", ")}{" "}
                  {winnerPickWinners.length === 1 ? "wins" : "split"} the pot!
                </p>
              ) : (
                <p className="text-muted-foreground">No one picked the winner.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Leaderboard */}
        <div className="space-y-3">
          {sortedEntries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No entries yet.
              </CardContent>
            </Card>
          ) : (
            sortedEntries.map((entry) => {
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
                                <td className="px-3 py-1.5 text-muted-foreground">
                                  T{pick.tier}
                                </td>
                                <td className="px-3 py-1.5">
                                  {pick.golfer.name}
                                  {pick.isDropped && (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                      (dropped)
                                    </span>
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
            })
          )}
        </div>

        <div className="text-center">
          <Link href={`/majors/${params.id}/enter`}>
            <Button variant="outline" size="sm">Submit Your Entry</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
