"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Trophy, Users, ChevronRight } from "lucide-react"

interface Tournament {
  id: string
  name: string
  type: string
  year: number
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED"
  buyIn: number
  sideBetAmount: number
  payoutStructure: string
  oddsUpdatedAt: string | null
  scoresUpdatedAt: string | null
  _count: { entries: number; golfers: number }
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> =
  {
    UPCOMING: { label: "Picks Open", variant: "secondary" },
    IN_PROGRESS: { label: "In Progress", variant: "default" },
    COMPLETED: { label: "Completed", variant: "outline" },
  }

const TYPE_LABEL: Record<string, string> = {
  PLAYERS_CHAMPIONSHIP: "The Players Championship",
  MASTERS: "The Masters",
  PGA_CHAMPIONSHIP: "PGA Championship",
  US_OPEN: "U.S. Open",
  THE_OPEN: "The Open Championship",
}

export default function MajorsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/majors")
      .then((r) => r.json())
      .then((d) => setTournaments(d.tournaments ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Majors Pools</h2>
          <p className="text-muted-foreground text-sm">Pick 6 golfers across the 5 majors</p>
        </div>
        <Link href="/majors/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Pool
          </Button>
        </Link>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {!loading && tournaments.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <Trophy className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">No pools yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create a pool for an upcoming major
            </p>
            <Link href="/majors/new">
              <Button>Create First Pool</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {tournaments.map((t) => {
          const status = STATUS_LABEL[t.status] ?? STATUS_LABEL.UPCOMING
          return (
            <Link key={t.id} href={`/majors/${t.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      <CardDescription>{TYPE_LABEL[t.type] ?? t.type} · {t.year}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {t._count.entries} {t._count.entries === 1 ? "entry" : "entries"}
                    </span>
                    <span>{t._count.golfers} golfers loaded</span>
                    <span>${t.buyIn} buy-in · ${t.sideBetAmount} side bet · {t.payoutStructure === "TOP_THREE" ? "Top 3 paid" : "Winner take all"}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
