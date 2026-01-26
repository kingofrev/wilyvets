import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Play, Trophy } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const [activeRounds, recentRounds, playerCount, courseCount] = await Promise.all([
    prisma.round.findMany({
      where: {
        createdById: session?.user?.id,
        status: "IN_PROGRESS",
      },
      include: {
        course: true,
        players: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
    prisma.round.findMany({
      where: {
        createdById: session?.user?.id,
        status: "COMPLETED",
      },
      include: {
        course: true,
        players: true,
      },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.player.count({
      where: { createdById: session?.user?.id },
    }),
    prisma.course.count({
      where: { createdBy: session?.user?.id },
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold">
          Hey, {session?.user?.name?.split(" ")[0]}!
        </h2>
        <p className="text-muted-foreground">Ready to play?</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/rounds/new">
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center p-6">
              <PlusCircle className="h-8 w-8 text-primary mb-2" />
              <span className="font-medium">New Round</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/records">
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center p-6">
              <Trophy className="h-8 w-8 text-primary mb-2" />
              <span className="font-medium">Records</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Active Rounds */}
      {activeRounds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Rounds</CardTitle>
            <CardDescription>Continue playing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeRounds.map((round) => (
              <Link key={round.id} href={`/rounds/${round.id}/play`}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors">
                  <div>
                    <p className="font-medium">{round.course.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Hole {round.currentHole} • {round.players.length} players
                    </p>
                  </div>
                  <Button size="sm">
                    <Play className="h-4 w-4 mr-1" />
                    Resume
                  </Button>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Rounds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Rounds</CardTitle>
          <CardDescription>Your completed rounds</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRounds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No rounds yet.</p>
              <Link href="/rounds/new" className="text-primary hover:underline">
                Start your first round
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentRounds.map((round) => (
                <Link key={round.id} href={`/rounds/${round.id}/results`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors">
                    <div>
                      <p className="font-medium">{round.course.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(round.date).toLocaleDateString()} • {round.players.length} players
                      </p>
                    </div>
                    <Badge variant="outline">
                      {formatCurrency(Number(round.betAmount))}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{playerCount}</p>
            <p className="text-sm text-muted-foreground">Players</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{courseCount}</p>
            <p className="text-sm text-muted-foreground">Courses</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
