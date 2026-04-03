"use client"

import { useState, useEffect, Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, Trophy, AlertCircle } from "lucide-react"
import { formatScore, tierLabel } from "@/lib/games/majors"

interface Golfer {
  id: string
  name: string
  tier: number
  odds: number
  totalScore: number | null
  isCut: boolean
  isWithdrawn: boolean
  position: string | null
}

interface TournamentPublic {
  id: string
  name: string
  type: string
  year: number
  status: string
  golfers: Golfer[]
  entryCount: number
  groupId: string | null
  groupName: string | null
}

const TYPE_LABEL: Record<string, string> = {
  PLAYERS_CHAMPIONSHIP: "The Players Championship",
  MASTERS: "The Masters",
  PGA_CHAMPIONSHIP: "PGA Championship",
  US_OPEN: "U.S. Open",
  THE_OPEN: "The Open Championship",
}

function EnterMajorsInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const groupId = searchParams.get("group")

  const [tournament, setTournament] = useState<TournamentPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [tierPicks, setTierPicks] = useState<Record<number, string>>({}) // tier → golferId
  const [winnerPickId, setWinnerPickId] = useState("")
  const [tiebreaker, setTiebreaker] = useState("")

  useEffect(() => {
    const url = groupId
      ? `/api/majors/${params.id}/public?group=${groupId}`
      : `/api/majors/${params.id}/public`
    fetch(url)
      .then((r) => r.json())
      .then((d) => setTournament(d.tournament))
      .catch(() => setError("Failed to load tournament"))
      .finally(() => setLoading(false))
  }, [params.id, groupId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-3 text-destructive" />
            <p className="font-medium">{error ?? "Tournament not found"}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (tournament.status === "COMPLETED") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-3 text-yellow-500" />
            <p className="font-medium">This pool is closed</p>
            <p className="text-sm text-muted-foreground mt-1">
              {tournament.name} has ended.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    const lbUrl = groupId
      ? `/majors/${params.id}/leaderboard?group=${groupId}`
      : `/majors/${params.id}/leaderboard`
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-10 text-center">
            <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold mb-1">You&apos;re in!</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Good luck at {tournament.name}{tournament.groupName ? ` — ${tournament.groupName}` : ""}.
              {" "}$10 buy-in to {name?.split(" ")[0] ?? "the organiser"}.
            </p>
            <Link href={lbUrl}>
              <Button variant="outline" size="sm">View Leaderboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tierGroups = [1, 2, 3, 4, 5, 6].map((tier) => ({
    tier,
    golfers: tournament.golfers.filter((g) => g.tier === tier),
  }))

  const allPicked = Object.keys(tierPicks).length === 6

  async function submit() {
    if (!name.trim()) { setError("Please enter your name"); return }
    if (!allPicked) { setError("Please pick one golfer from each tier"); return }
    if (!tiebreaker) { setError("Please enter a tiebreaker score"); return }
    setError(null)
    setSubmitting(true)

    try {
      const picks = Object.entries(tierPicks).map(([tier, golferId]) => ({
        tier: parseInt(tier),
        golferId,
      }))

      const res = await fetch(`/api/majors/${params.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entrantName: name.trim(),
          email: email.trim() || undefined,
          picks,
          winnerPickId: winnerPickId || undefined,
          tiebreaker: tiebreaker ? parseInt(tiebreaker) : undefined,
          groupId: groupId || undefined,
        }),
      })

      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  const isMasters = tournament.type === "MASTERS"

  return (
    <div className="min-h-screen bg-background">
      {/* Masters hero banner */}
      {isMasters && (
        <div
          className="relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #004d35 0%, #006747 50%, #005a3c 100%)" }}
        >
          {/* Decorative circles */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-10" style={{ background: "#d4af37" }} />
            <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-10" style={{ background: "#d4af37" }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full opacity-5" style={{ background: "#d4af37" }} />
          </div>

          <div className="relative max-w-lg mx-auto px-4 py-8 text-center">
            {/* Crest / logo mark */}
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3 shadow-lg"
              style={{ background: "rgba(212,175,55,0.2)", border: "2px solid rgba(212,175,55,0.5)" }}
            >
              <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                <path d="M12 2L9.5 8.5H3L8 12.5L6 19L12 15L18 19L16 12.5L21 8.5H14.5L12 2Z" fill="#d4af37" />
              </svg>
            </div>

            <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: "rgba(212,175,55,0.8)" }}>
              Augusta National · {tournament.year}
            </p>
            <h1 className="text-3xl font-bold text-white mb-1">The Masters</h1>
            <p className="text-sm font-medium mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
              {tournament.name}
            </p>
            {tournament.groupName && (
              <p className="text-sm font-semibold mb-3" style={{ color: "#d4af37" }}>{tournament.groupName}</p>
            )}
            <div className="flex items-center justify-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              <span>$10 buy-in</span>
              <span>·</span>
              <span>best 4 of 6</span>
              <span>·</span>
              <span>{tournament.entryCount} {tournament.entryCount === 1 ? "entry" : "entries"} so far</span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto space-y-5 py-6 px-4">
        {/* Header (non-Masters) */}
        {!isMasters && (
        <div className="text-center py-2">
          <p className="text-sm text-muted-foreground">{TYPE_LABEL[tournament.type] ?? tournament.type}</p>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          {tournament.groupName && (
            <p className="text-base font-medium text-primary mt-0.5">{tournament.groupName}</p>
          )}
          <div className="flex items-center justify-center gap-3 mt-2 text-sm text-muted-foreground">
            <span>$10 buy-in · best 4 of 6</span>
            <span>·</span>
            <span>{tournament.entryCount} {tournament.entryCount === 1 ? "entry" : "entries"} so far</span>
          </div>
        </div>
        )}

        {/* Your Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
          </CardContent>
        </Card>

        {/* Rules */}
        <Card className="bg-muted/30">
          <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
            <p>• Pick 1 golfer from each of the 6 tiers. Your best 4 scores count.</p>
            <p>• Missed cut? That golfer gets the worst R3 &amp; R4 score in the field.</p>
            <p>• Lowest combined score wins the $10 pool. Tiebreaker = closest to winning score.</p>
            <p>• Separate $5 pick-the-winner side bet (winner take all).</p>
          </CardContent>
        </Card>

        {/* Tier Picks */}
        {tierGroups.map(({ tier, golfers }) => (
          <Card key={tier} className={tierPicks[tier] ? "ring-1 ring-primary/30" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{tierLabel(tier)}</CardTitle>
                {tierPicks[tier] && (
                  <Badge variant="default" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Picked
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">Pick 1 golfer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {golfers.length === 0 && (
                <p className="text-sm text-muted-foreground">No golfers in this tier yet.</p>
              )}
              {golfers.map((g) => {
                const isSelected = tierPicks[tier] === g.id
                return (
                  <button
                    key={g.id}
                    onClick={() => setTierPicks((prev) => ({ ...prev, [tier]: g.id }))}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition-colors
                      ${isSelected
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:bg-muted/50"
                      }`}
                  >
                    <span>{g.name}</span>
                    <div className="flex items-center gap-2">
                      {(tournament.status === "IN_PROGRESS" || tournament.status === "COMPLETED") &&
                        g.totalScore !== null && (
                          <span className={`text-xs ${g.totalScore < 0 ? "text-red-600" : g.totalScore > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                            {formatScore(g.totalScore)}
                            {g.position && ` (${g.position})`}
                          </span>
                        )}
                      <span className="text-xs text-muted-foreground">+{g.odds}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        ))}

        {/* Winner Pick Side Bet */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Pick the Winner
            </CardTitle>
            <CardDescription>
              $5 side bet · winner take all · optional but recommended
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              <button
                onClick={() => setWinnerPickId("")}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition-colors
                  ${!winnerPickId ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-muted/50"}`}
              >
                <span className="text-muted-foreground">No pick (skip $5 side bet)</span>
              </button>
              {tournament.golfers
                .sort((a, b) => a.odds - b.odds)
                .map((g) => {
                  const isSelected = winnerPickId === g.id
                  return (
                    <button
                      key={g.id}
                      onClick={() => setWinnerPickId(isSelected ? "" : g.id)}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition-colors
                        ${isSelected
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:bg-muted/50"
                        }`}
                    >
                      <span>{g.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">+{g.odds}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                    </button>
                  )
                })}
            </div>
          </CardContent>
        </Card>

        {/* Tiebreaker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tiebreaker</CardTitle>
            <CardDescription>
              Predict the winning score (strokes relative to par). Closest prediction wins a
              tie. Enter negative for under par (e.g. -15).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={tiebreaker}
                onChange={(e) => setTiebreaker(e.target.value)}
                placeholder="-15"
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">
                {tiebreaker
                  ? tiebreaker === "0"
                    ? "Even par"
                    : parseInt(tiebreaker) < 0
                      ? `${Math.abs(parseInt(tiebreaker))} under par`
                      : `${tiebreaker} over par`
                  : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={submit}
          disabled={submitting || !name || !allPicked || !tiebreaker}
          className="w-full"
          size="lg"
        >
          {submitting ? "Submitting..." : `Submit Entry${!allPicked ? ` (${6 - Object.keys(tierPicks).length} tiers remaining)` : ""}`}
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-4">
          WilyVets · Majors Pool
        </p>
      </div>
    </div>
  )
}

export default function EnterMajorsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>}>
      <EnterMajorsInner />
    </Suspense>
  )
}
