"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { ArrowLeft } from "lucide-react"

const TOURNAMENT_TYPES = [
  { value: "PLAYERS_CHAMPIONSHIP", label: "The Players Championship" },
  { value: "MASTERS", label: "The Masters" },
  { value: "PGA_CHAMPIONSHIP", label: "PGA Championship" },
  { value: "US_OPEN", label: "U.S. Open" },
  { value: "THE_OPEN", label: "The Open Championship" },
]

export default function NewMajorsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [buyIn, setBuyIn] = useState("10")
  const [espnEventId, setEspnEventId] = useState("")

  function handleTypeChange(value: string) {
    setType(value)
    const label = TOURNAMENT_TYPES.find((t) => t.value === value)?.label ?? ""
    if (!name) setName(`${year} ${label}`)
    else setName(`${year} ${label}`)
  }

  function handleYearChange(value: string) {
    setYear(value)
    const label = TOURNAMENT_TYPES.find((t) => t.value === type)?.label ?? ""
    if (label) setName(`${value} ${label}`)
  }

  async function create() {
    if (!name || !type || !year) {
      toast({ title: "Error", description: "Name, type, and year are required", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/majors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, year, buyIn, espnEventId: espnEventId || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const { tournament } = await res.json()
      toast({ title: "Pool created!", description: "Load odds to set up tiers." })
      router.push(`/majors/${tournament.id}`)
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create pool",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/majors">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">New Majors Pool</h2>
          <p className="text-muted-foreground">Best 4 of 6 picks count</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tournament</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tournament</Label>
            <Select value={type} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select tournament..." />
              </SelectTrigger>
              <SelectContent>
                {TOURNAMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Year</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => handleYearChange(e.target.value)}
              className="w-28"
            />
          </div>

          <div className="space-y-2">
            <Label>Pool Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2025 Masters" />
          </div>

          <div className="space-y-2">
            <Label>Buy-in per person</Label>
            <Select value={buyIn} onValueChange={setBuyIn}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">$10</SelectItem>
                <SelectItem value="20">$20</SelectItem>
                <SelectItem value="50">$50</SelectItem>
                <SelectItem value="100">$100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ESPN Event ID</CardTitle>
          <CardDescription>
            Optional. Needed for live score fetching once the tournament starts. Find it in the
            ESPN URL for the event leaderboard (e.g. 401580351).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={espnEventId}
            onChange={(e) => setEspnEventId(e.target.value)}
            placeholder="e.g. 401580351"
          />
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="py-4 text-sm text-muted-foreground space-y-1">
          <p><strong>Scoring:</strong> Each entrant picks 1 golfer per tier (6 total). Best 4 of 6 scores count — the 2 worst picks are dropped.</p>
          <p><strong>Missed cut:</strong> Golfer&apos;s R3 &amp; R4 scores become the worst R3/R4 in the field.</p>
          <p><strong>Tiebreaker:</strong> Closest predicted winning score.</p>
          <p><strong>Side bet:</strong> $5 pick-the-winner, winner take all.</p>
        </CardContent>
      </Card>

      <Button onClick={create} disabled={loading || !type || !name} className="w-full" size="lg">
        {loading ? "Creating..." : "Create Pool"}
      </Button>
    </div>
  )
}
