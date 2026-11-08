"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

export interface ActiveRound {
  id: string;
  courseName: string;
  currentHole: number;
  playerCount: number;
}

export function ActiveRounds({ rounds }: { rounds: ActiveRound[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<ActiveRound | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteRound(round: ActiveRound) {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/rounds/${round.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete round");
      }

      setPendingDelete(null);
      toast({ title: "Round deleted" });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete round",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  if (rounds.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Rounds</CardTitle>
          <CardDescription>Continue playing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rounds.map((round) => (
            <div
              key={round.id}
              className="flex items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted transition-colors"
            >
              <Link
                href={`/rounds/${round.id}/play`}
                className="flex-1 min-w-0"
              >
                <p className="font-medium truncate">{round.courseName}</p>
                <p className="text-sm text-muted-foreground truncate">
                  Hole {round.currentHole} • {round.playerCount} players
                </p>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" asChild>
                  <Link href={`/rounds/${round.id}/play`}>
                    <Play className="h-4 w-4 mr-1" />
                    Resume
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setPendingDelete(round)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Confirmation step — nothing is deleted until this is accepted */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this round?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.courseName}, through hole{" "}
              {pendingDelete?.currentHole}. Every score, match and press in this
              round is deleted for good. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() => setPendingDelete(null)}
            >
              Keep round
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => pendingDelete && deleteRound(pendingDelete)}
            >
              {isDeleting ? "Deleting..." : "Delete round"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
