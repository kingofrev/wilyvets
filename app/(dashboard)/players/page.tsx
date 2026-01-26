"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, User, Pencil, Trash2 } from "lucide-react";
import { formatHandicap } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  handicap: string | null;
  email: string | null;
}

export default function PlayersPage() {
  const { toast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  useEffect(() => {
    fetchPlayers();
  }, []);

  async function fetchPlayers() {
    try {
      const response = await fetch("/api/players");
      const data = await response.json();
      setPlayers(data.players || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load players", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const handicap = formData.get("handicap") as string;
    const email = formData.get("email") as string;

    try {
      const url = editingPlayer ? `/api/players/${editingPlayer.id}` : "/api/players";
      const method = editingPlayer ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, handicap: handicap || null, email: email || null }),
      });

      if (!response.ok) throw new Error("Failed to save player");

      toast({ title: "Success", description: editingPlayer ? "Player updated" : "Player added" });
      setDialogOpen(false);
      setEditingPlayer(null);
      fetchPlayers();
    } catch {
      toast({ title: "Error", description: "Failed to save player", variant: "destructive" });
    }
  }

  async function deletePlayer(id: string) {
    if (!confirm("Are you sure you want to delete this player?")) return;

    try {
      const response = await fetch(`/api/players/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete");

      toast({ title: "Success", description: "Player deleted" });
      fetchPlayers();
    } catch {
      toast({ title: "Error", description: "Failed to delete player", variant: "destructive" });
    }
  }

  function openEditDialog(player: Player) {
    setEditingPlayer(player);
    setDialogOpen(true);
  }

  function openNewDialog() {
    setEditingPlayer(null);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Players</h2>
          <p className="text-muted-foreground">Manage your golf buddies</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPlayer ? "Edit Player" : "Add Player"}</DialogTitle>
              <DialogDescription>
                {editingPlayer ? "Update player details" : "Add a new player to your list"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="John Smith"
                    defaultValue={editingPlayer?.name || ""}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="handicap">Handicap</Label>
                  <Input
                    id="handicap"
                    name="handicap"
                    type="number"
                    step="0.1"
                    placeholder="12.5"
                    defaultValue={editingPlayer?.handicap || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                    defaultValue={editingPlayer?.email || ""}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">
                  {editingPlayer ? "Update" : "Add Player"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : players.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No players yet</p>
            <Button onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Player
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {players.map((player) => (
            <Card key={player.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="font-semibold text-primary">
                      {player.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{player.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Handicap: {formatHandicap(player.handicap)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(player)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deletePlayer(player.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
