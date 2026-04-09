"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  Share2,
  Check,
  Trophy,
  ChevronDown,
  ChevronUp,
  Plus,
  Users,
  ExternalLink,
  Trash2,
  Pencil,
  X,
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

interface Group {
  id: string
  name: string
  _count: { entries: number }
}

interface Tournament {
  id: string
  name: string
  type: string
  year: number
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED"
  buyIn: number
  sideBetAmount: number
  payoutStructure: string
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
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchingOdds, setFetchingOdds] = useState(false)
  const [fetchingScores, setFetchingScores] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"leaderboard" | "field">("leaderboard")
  const [newGroupName, setNewGroupName] = useState("")
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editPicks, setEditPicks] = useState<Record<number, string>>({}) // tier → golferId
  const [editTiebreaker, setEditTiebreaker] = useState("")
  const [editWinnerPickId, setEditWinnerPickId] = useState("")
  const [savingEntry, setSavingEntry] = useState(false)

  const load = useCallback(async () => {
    const [tRes, gRes] = await Promise.all([
      fetch(`/api/majors/${params.id}`),
      fetch(`/api/majors/${params.id}/groups`),
    ])
    if (tRes.ok) {
      const d = await tRes.json()
      setTournament(d.tournament)
    }
    if (gRes.ok) {
      const d = await gRes.json()
      setGroups(d.groups ?? [])
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

  async function saveSetting(field: "buyIn" | "sideBetAmount" | "payoutStructure", value: string) {
    setSavingSettings(true)
    try {
      await fetch(`/api/majors/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      load()
      toast({ title: "Settings saved" })
    } catch {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" })
    } finally {
      setSavingSettings(false)
    }
  }

  function startEditEntry(entry: Entry) {
    const picks: Record<number, string> = {}
    for (const pick of entry.picks) picks[pick.tier] = pick.golfer.id
    setEditPicks(picks)
    setEditTiebreaker(entry.tiebreaker !== null ? String(entry.tiebreaker) : "")
    setEditWinnerPickId(entry.winnerPick?.id ?? "none")
    setEditingEntryId(entry.id)
  }

  async function saveEntry(entryId: string) {
    setSavingEntry(true)
    try {
      const picks = Object.entries(editPicks).map(([tier, golferId]) => ({
        tier: parseInt(tier),
        golferId,
      }))
      const res = await fetch(`/api/majors/${params.id}/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          picks,
          tiebreaker: editTiebreaker !== "" ? parseInt(editTiebreaker) : null,
          winnerPickId: editWinnerPickId === "none" ? null : editWinnerPickId || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setEditingEntryId(null)
      load()
      toast({ title: "Entry updated" })
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" })
    } finally {
      setSavingEntry(false)
    }
  }

  async function createGroup() {
    if (!newGroupName.trim()) return
    setCreatingGroup(true)
    try {
      const res = await fetch(`/api/majors/${params.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setNewGroupName("")
      setGroups((prev) => [...prev, d.group])
      toast({ title: "Group created!", description: `"${d.group.name}" is ready to share.` })
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create group",
        variant: "destructive",
      })
    } finally {
      setCreatingGroup(false)
    }
  }

  async function deleteGroup(groupId: string, groupName: string) {
    if (!confirm(`Delete "${groupName}"? All entries in this group will be removed.`)) return
    const res = await fetch(`/api/majors/${params.id}/groups?groupId=${groupId}`, { method: "DELETE" })
    if (res.ok) {
      setGroups((prev) => prev.filter((g) => g.id !== groupId))
      toast({ title: "Group deleted" })
    }
  }

  function copyLink(url: string, key: string) {
    navigator.clipboard.writeText(url)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
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

  const actualWinner = tournament.golfers
    .filter((g) => !g.isCut && !g.isWithdrawn && g.totalScore !== null)
    .sort((a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0))[0]

  const winnerPickCorrect = actualWinner
    ? tournament.entries.filter((e) => e.winnerPick?.id === actualWinner.id)
    : []

  const winnerPickWinners = (() => {
    if (winnerPickCorrect.length <= 1) return winnerPickCorrect
    const winnerScore = actualWinner?.totalScore ?? null
    if (winnerScore === null) return winnerPickCorrect
    const withDist = winnerPickCorrect.map((e) => ({
      entry: e,
      dist: e.tiebreaker !== null ? Math.abs(e.tiebreaker - winnerScore) : Infinity,
    }))
    const best = Math.min(...withDist.map((x) => x.dist))
    return withDist.filter((x) => x.dist === best).map((x) => x.entry)
  })()

  const baseUrl = typeof window !== "undefined" ? window.location.origin : ""

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
              {tournament.entries.length} {tournament.entries.length === 1 ? "entry" : "entries"} total
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

      {/* Pool Settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Pool Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm w-32 shrink-0">Buy-in per person</span>
            <Select
              value={String(tournament.buyIn)}
              onValueChange={(v) => saveSetting("buyIn", v)}
              disabled={savingSettings}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">$10</SelectItem>
                <SelectItem value="20">$20</SelectItem>
                <SelectItem value="40">$40</SelectItem>
                <SelectItem value="50">$50</SelectItem>
                <SelectItem value="75">$75</SelectItem>
                <SelectItem value="100">$100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-32 shrink-0">Pick the Winner bet</span>
            <Select
              value={String(tournament.sideBetAmount)}
              onValueChange={(v) => saveSetting("sideBetAmount", v)}
              disabled={savingSettings}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">$5</SelectItem>
                <SelectItem value="10">$10</SelectItem>
                <SelectItem value="20">$20</SelectItem>
                <SelectItem value="25">$25</SelectItem>
                <SelectItem value="50">$50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-32 shrink-0">Payout structure</span>
            <Select
              value={tournament.payoutStructure}
              onValueChange={(v) => saveSetting("payoutStructure", v)}
              disabled={savingSettings}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WINNER_TAKE_ALL">Winner take all</SelectItem>
                <SelectItem value="TOP_THREE">Top 3 — 60% / 30% / 10%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Groups */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Pools / Groups</CardTitle>
          <CardDescription className="text-xs">
            Create separate pools and share a unique link with each group.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Create group */}
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Family Pool, Work Pool..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createGroup()}
              className="text-sm h-8"
            />
            <Button size="sm" onClick={createGroup} disabled={creatingGroup || !newGroupName.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>

          {/* Group list */}
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">No groups yet. Create one above to get a shareable link.</p>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => {
                const entryUrl = `${baseUrl}/majors/${params.id}/enter?group=${group.id}`
                const lbUrl = `${baseUrl}/majors/${params.id}/leaderboard?group=${group.id}`
                return (
                  <div
                    key={group.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{group.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {group._count.entries} {group._count.entries === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => copyLink(entryUrl, `entry-${group.id}`)}
                      >
                        {copied === `entry-${group.id}` ? (
                          <Check className="h-3 w-3 mr-1" />
                        ) : (
                          <Share2 className="h-3 w-3 mr-1" />
                        )}
                        {copied === `entry-${group.id}` ? "Copied!" : "Share"}
                      </Button>
                      <Link href={lbUrl} target="_blank">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Board
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => deleteGroup(group.id, group.name)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
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
                Pick the Winner — ${tournament.entries.length * tournament.sideBetAmount} pot
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actualWinner && tournament.status === "COMPLETED" ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Winner: {actualWinner.name} ({formatScore(actualWinner.totalScore)})
                  </p>
                  {winnerPickWinners.length > 0 ? (
                    <>
                      <p className="text-sm text-green-600 font-medium">
                        {winnerPickWinners.map((e) => e.entrantName).join(", ")}{" "}
                        {winnerPickWinners.length === 1 ? "wins" : "split"} the pot!
                      </p>
                      {winnerPickCorrect.length > winnerPickWinners.length && (
                        <p className="text-xs text-muted-foreground">Decided by tiebreaker</p>
                      )}
                    </>
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
          All Entries
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === "field" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
          onClick={() => setActiveTab("field")}
        >
          Field by Tier
        </button>
      </div>

      {/* All Entries Tab */}
      {activeTab === "leaderboard" && (
        <div className="space-y-3">
          {sortedEntries.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No entries yet. Create a group and share the link.
              </CardContent>
            </Card>
          )}
          {sortedEntries.map((entry) => {
            const isEditing = editingEntryId === entry.id
            const isExpanded = expandedEntry === entry.id
            return (
              <Card key={entry.id} className="overflow-hidden">
                <div className="flex items-center">
                  {/* Toggle area */}
                  <button
                    className="flex-1 text-left"
                    onClick={() => !isEditing && setExpandedEntry(isExpanded ? null : entry.id)}
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
                  {/* Edit button — sibling, not nested */}
                  <button
                    onClick={() => isEditing ? setEditingEntryId(null) : startEditEntry(entry)}
                    className="px-3 py-3 hover:bg-muted transition-colors self-stretch flex items-center border-l"
                    title={isEditing ? "Cancel edit" : "Edit entry"}
                  >
                    {isEditing ? <X className="h-4 w-4 text-muted-foreground" /> : <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>

                {isEditing && (
                  <div className="border-t bg-muted/20 p-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Edit Entry</p>
                    {[1, 2, 3, 4, 5, 6].map((tier) => (
                      <div key={tier} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-14 shrink-0">{`Tier ${tier}`}</span>
                        <Select
                          value={editPicks[tier] ?? undefined}
                          onValueChange={(v) => setEditPicks((prev) => ({ ...prev, [tier]: v }))}
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue placeholder="Pick a golfer..." />
                          </SelectTrigger>
                          <SelectContent>
                            {tournament.golfers
                              .filter((g) => g.tier === tier)
                              .sort((a, b) => a.odds - b.odds)
                              .map((g) => (
                                <SelectItem key={g.id} value={g.id} className="text-xs">
                                  {g.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">Tiebreaker</span>
                      <Input
                        type="number"
                        value={editTiebreaker}
                        onChange={(e) => setEditTiebreaker(e.target.value)}
                        placeholder="e.g. -15"
                        className="w-28 h-8 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">
                        {editTiebreaker === "" ? "" : editTiebreaker === "0" ? "E" : parseInt(editTiebreaker) < 0 ? `${Math.abs(parseInt(editTiebreaker))} under` : `+${editTiebreaker}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">Winner pick</span>
                      <Select
                        value={editWinnerPickId}
                        onValueChange={setEditWinnerPickId}
                      >
                        <SelectTrigger className="flex-1 h-8 text-xs">
                          <SelectValue placeholder="No pick" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">No pick</SelectItem>
                          {tournament.golfers
                            .sort((a, b) => a.odds - b.odds)
                            .map((g) => (
                              <SelectItem key={g.id} value={g.id} className="text-xs">
                                {g.name} (+{g.odds})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => saveEntry(entry.id)}
                      disabled={savingEntry || Object.keys(editPicks).length !== 6}
                      className="w-full"
                    >
                      {savingEntry ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                )}

                {!isEditing && isExpanded && (
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
