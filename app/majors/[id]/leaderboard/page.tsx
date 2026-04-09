"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Minus, Plus, Trophy, Send, MessageCircle, X } from "lucide-react"
import { formatScore } from "@/lib/games/majors"

interface Golfer {
  id: string
  name: string
  tier: number
  odds: number
  totalScore: number | null
  position: string | null
  thru: string | null
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
  buyIn: number
  payoutStructure: string
  entries: Entry[]
  golfers: Golfer[]
  entryCount: number
  groupId: string | null
  groupName: string | null
}

interface Message {
  id: string
  authorName: string
  body: string
  createdAt: string
}

function ChatBody({
  messages,
  chatName,
  chatInput,
  sending,
  messagesEndRef,
  onNameChange,
  onInputChange,
  onSubmit,
  fullHeight,
}: {
  messages: Message[]
  chatName: string
  chatInput: string
  sending: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
  onNameChange: (v: string) => void
  onInputChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  fullHeight?: boolean
}) {
  return (
    <div className="space-y-3 flex flex-col h-full">
      <div className={`overflow-y-auto space-y-2 pr-1 ${fullHeight ? "flex-1" : "h-64"}`}>
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center pt-8">No messages yet. Say something!</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span className="font-medium">{msg.authorName}</span>
              <span className="text-muted-foreground text-xs ml-1.5">{formatTime(msg.createdAt)}</span>
              <p className="text-foreground/90 mt-0.5">{msg.body}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={onSubmit} className="space-y-2 shrink-0">
        <Input
          placeholder="Your name"
          value={chatName}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={50}
          className="text-sm"
        />
        <div className="flex gap-2">
          <Input
            placeholder="Say something..."
            value={chatInput}
            onChange={(e) => onInputChange(e.target.value)}
            maxLength={500}
            className="text-sm"
          />
          <Button type="submit" size="icon" disabled={sending || !chatInput.trim() || !chatName.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
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

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function PublicLeaderboardInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const groupId = searchParams.get("group")

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsedEntries, setCollapsedEntries] = useState<Record<string, boolean>>({})

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [chatName, setChatName] = useState("")
  const [chatInput, setChatInput] = useState("")
  const [sending, setSending] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    const url = groupId
      ? `/api/majors/${params.id}/public?group=${groupId}`
      : `/api/majors/${params.id}/public`
    fetch(url)
      .then((r) => r.json())
      .then((d) => setTournament(d.tournament))
      .finally(() => setLoading(false))
  }, [params.id, groupId])

  // Load saved name from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("majors-chat-name")
    if (saved) setChatName(saved)
  }, [])

  // Initial message load
  useEffect(() => {
    fetchMessages()
  }, [params.id])

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchMessages, 10000)
    return () => clearInterval(interval)
  }, [params.id])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function fetchMessages() {
    const res = await fetch(`/api/majors/${params.id}/messages`)
    if (!res.ok) return
    const data = await res.json()
    setMessages(data.messages)
    if (data.messages.length > 0) {
      lastMessageIdRef.current = data.messages[data.messages.length - 1].id
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim() || !chatName.trim()) return
    setSending(true)
    try {
      localStorage.setItem("majors-chat-name", chatName.trim())
      const res = await fetch(`/api/majors/${params.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: chatName.trim(), body: chatInput.trim() }),
      })
      if (res.ok) {
        setChatInput("")
        await fetchMessages()
      }
    } finally {
      setSending(false)
    }
  }

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
  if (!tournament) return <p className="text-destructive py-8 text-center">Tournament not found.</p>

  const sortedEntries = [...tournament.entries].sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank
    if (a.rank !== null) return -1
    if (b.rank !== null) return 1
    return 0
  })

  const isCompleted = tournament.status === "COMPLETED"

  // Current leader during IN_PROGRESS, or final winner when COMPLETED
  const actualLeader = tournament.golfers
    .filter((g) => !g.isCut && !g.isWithdrawn && g.totalScore !== null)
    .sort((a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0))[0] ?? null

  const winnerPickCorrect = actualLeader
    ? tournament.entries.filter((e) => e.winnerPick?.id === actualLeader.id)
    : []

  // Apply tiebreaker to the winner pick side bet
  const winnerPickWinners = (() => {
    if (winnerPickCorrect.length <= 1) return winnerPickCorrect
    const leaderScore = actualLeader?.totalScore ?? null
    if (leaderScore === null) return winnerPickCorrect
    const withDist = winnerPickCorrect.map((e) => ({
      entry: e,
      dist: e.tiebreaker !== null ? Math.abs(e.tiebreaker - leaderScore) : Infinity,
    }))
    const best = Math.min(...withDist.map((x) => x.dist))
    return withDist.filter((x) => x.dist === best).map((x) => x.entry)
  })()

  const isMasters = tournament.type === "MASTERS"

  return (
    <div className="min-h-screen bg-background">
      {/* Masters hero banner */}
      {isMasters && (
        <div
          className="relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #004d35 0%, #006747 50%, #005a3c 100%)" }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-10" style={{ background: "#d4af37" }} />
            <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-10" style={{ background: "#d4af37" }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full opacity-5" style={{ background: "#d4af37" }} />
          </div>
          <div className="relative max-w-lg mx-auto px-4 py-8 text-center">
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
            <div className="flex items-center justify-center gap-2">
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
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                {tournament.entryCount} {tournament.entryCount === 1 ? "entry" : "entries"}
                {" · "}${tournament.buyIn} buy-in
                {" · "}{tournament.payoutStructure === "TOP_THREE" ? "Top 3 paid (60/30/10)" : "Winner take all"}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Header (non-Masters) */}
        {!isMasters && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{tournament.name}</h1>
              {tournament.groupName && (
                <p className="text-base font-medium text-primary">{tournament.groupName}</p>
              )}
            </div>
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
            {" · "}${tournament.buyIn} buy-in
            {" · "}{tournament.payoutStructure === "TOP_THREE" ? "Top 3 paid (60/30/10)" : "Winner take all"}
          </p>
        </div>
        )}

        {/* Winner pick result */}
        {(tournament.status === "IN_PROGRESS" || tournament.status === "COMPLETED") && actualLeader && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                <Trophy className="h-4 w-4 inline mr-1.5 text-yellow-500" />
                Pick the Winner
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">
                {isCompleted ? "Winner" : "Current Leader"}: {actualLeader.name} ({formatScore(actualLeader.totalScore)})
              </p>
              {winnerPickWinners.length > 0 ? (
                <>
                  <p className={isCompleted ? "text-green-600 font-medium" : "text-muted-foreground"}>
                    {winnerPickWinners.map((e) => e.entrantName).join(", ")}{" "}
                    {isCompleted
                      ? (winnerPickWinners.length === 1 ? "wins the pot!" : "split the pot!")
                      : (winnerPickWinners.length === 1 ? "has the current leader" : "have the current leader")}
                  </p>
                  {winnerPickCorrect.length > winnerPickWinners.length && (
                    <p className="text-xs text-muted-foreground">Decided by tiebreaker (closest predicted winning score)</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {isCompleted ? "No one picked the winner." : "No one has picked the current leader."}
                </p>
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
              const isExpanded = !collapsedEntries[entry.id]
              return (
                <Card key={entry.id} className="overflow-hidden">
                  <button
                    className="w-full text-left"
                    onClick={() => setCollapsedEntries((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div>
                            <p className="font-medium">
                              {entry.rank !== null && (
                                <span className="text-muted-foreground font-bold mr-1.5">{entry.rank}.</span>
                              )}
                              {entry.entrantName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              TB: {entry.tiebreaker !== null ? formatScore(entry.tiebreaker) : "-"}
                              {entry.winnerPick && ` · Winner: ${entry.winnerPick.name}`}
                            </p>
                          </div>
                        </div>
                        <span className="text-lg font-semibold">
                          <ScoreCell score={entry.totalScore} />
                        </span>
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
                            <th className="px-3 py-1.5 text-right">Thru</th>
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
                                <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                                  {pick.golfer.thru ?? "-"}
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

        {/* Chat — inline on desktop */}
        <div className="hidden sm:block">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
              <ChatBody
                messages={messages}
                chatName={chatName}
                chatInput={chatInput}
                sending={sending}
                messagesEndRef={messagesEndRef}
                onNameChange={setChatName}
                onInputChange={setChatInput}
                onSubmit={sendMessage}
              />
            </CardContent>
          </Card>
        </div>

        {/* Chat — floating button + modal on mobile */}
        <div className="sm:hidden">
          <button
            onClick={() => setChatOpen(true)}
            className="fixed bottom-5 right-5 z-50 bg-primary text-primary-foreground rounded-full p-3.5 shadow-lg relative"
            aria-label="Open chat"
          >
            <MessageCircle className="h-5 w-5" />
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {messages.length > 9 ? "9+" : messages.length}
              </span>
            )}
          </button>

          {chatOpen && (
            <div className="fixed inset-0 z-50 flex flex-col bg-background">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="font-semibold text-sm">Chat</span>
                <button onClick={() => setChatOpen(false)} aria-label="Close chat">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden p-3">
                <ChatBody
                  messages={messages}
                  chatName={chatName}
                  chatInput={chatInput}
                  sending={sending}
                  messagesEndRef={messagesEndRef}
                  onNameChange={setChatName}
                  onInputChange={setChatInput}
                  onSubmit={sendMessage}
                  fullHeight
                />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default function PublicLeaderboardPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>}>
      <PublicLeaderboardInner />
    </Suspense>
  )
}
