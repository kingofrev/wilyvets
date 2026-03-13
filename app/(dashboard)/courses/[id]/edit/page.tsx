"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const DEFAULT_HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  par: 4,
  handicap: i + 1,
  yardage: 0,
}));

export default function EditCoursePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [slope, setSlope] = useState("");
  const [rating, setRating] = useState("");
  const [holes, setHoles] = useState(DEFAULT_HOLES);

  useEffect(() => {
    fetch(`/api/courses/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        const c = d.course;
        if (!c) return;
        setName(c.name);
        setCity(c.city ?? "");
        setState(c.state ?? "");
        setSlope(c.slope != null ? String(c.slope) : "");
        setRating(c.rating != null ? String(c.rating) : "");
        if (c.holes?.length === 18) {
          setHoles(c.holes.map((h: { holeNumber: number; par: number; handicap: number; yardage: number | null }) => ({
            holeNumber: h.holeNumber,
            par: h.par,
            handicap: h.handicap,
            yardage: h.yardage ?? 0,
          })));
        }
      })
      .catch(() => toast({ title: "Error", description: "Failed to load course", variant: "destructive" }))
      .finally(() => setIsFetching(false));
  }, [params.id]);

  function updateHole(index: number, field: string, value: number) {
    const newHoles = [...holes];
    newHoles[index] = { ...newHoles[index], [field]: value };
    setHoles(newHoles);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const handicaps = holes.map((h) => h.handicap);
    const uniqueHandicaps = new Set(handicaps);
    if (uniqueHandicaps.size !== 18 || !handicaps.every((h) => h >= 1 && h <= 18)) {
      toast({ title: "Error", description: "Hole handicaps must be unique values from 1-18", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/courses/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city: city || null, state: state || null, slope: slope || null, rating: rating || null, holes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update course");
      }

      toast({ title: "Success", description: "Course updated!" });
      router.push(`/courses/${params.id}`);
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update course", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  if (isFetching) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/courses/${params.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Edit Course</h2>
          <p className="text-muted-foreground">Update course details and hole information</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Course Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Course Name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="slope">Slope Rating</Label>
                <Input id="slope" type="number" value={slope} onChange={(e) => setSlope(e.target.value)} placeholder="155" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rating">Course Rating</Label>
                <Input id="rating" type="number" step="0.1" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="75.3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hole Information</CardTitle>
            <CardDescription>Par and handicap (stroke index) for each hole. Handicap 1 = hardest hole.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Front 9</h4>
                <div className="grid grid-cols-9 gap-1 text-center text-xs">
                  {holes.slice(0, 9).map((hole, i) => (
                    <div key={hole.holeNumber} className="space-y-1">
                      <div className="font-medium bg-muted rounded p-1">{hole.holeNumber}</div>
                      <Input
                        type="number" min="3" max="5" value={hole.par}
                        onChange={(e) => updateHole(i, "par", parseInt(e.target.value) || 4)}
                        className="h-8 text-center p-1"
                      />
                      <Input
                        type="number" min="1" max="18" value={hole.handicap}
                        onChange={(e) => updateHole(i, "handicap", parseInt(e.target.value) || 1)}
                        className="h-8 text-center p-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Back 9</h4>
                <div className="grid grid-cols-9 gap-1 text-center text-xs">
                  {holes.slice(9, 18).map((hole, i) => (
                    <div key={hole.holeNumber} className="space-y-1">
                      <div className="font-medium bg-muted rounded p-1">{hole.holeNumber}</div>
                      <Input
                        type="number" min="3" max="5" value={hole.par}
                        onChange={(e) => updateHole(i + 9, "par", parseInt(e.target.value) || 4)}
                        className="h-8 text-center p-1"
                      />
                      <Input
                        type="number" min="1" max="18" value={hole.handicap}
                        onChange={(e) => updateHole(i + 9, "handicap", parseInt(e.target.value) || 1)}
                        className="h-8 text-center p-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>Row 1: Hole number | Row 2: Par (3-5) | Row 3: Handicap (1-18)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}
