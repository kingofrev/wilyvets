"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function NewCoursePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [holes, setHoles] = useState(DEFAULT_HOLES);

  function updateHole(index: number, field: string, value: number) {
    const newHoles = [...holes];
    newHoles[index] = { ...newHoles[index], [field]: value };
    setHoles(newHoles);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const city = formData.get("city") as string;
    const state = formData.get("state") as string;
    const slope = formData.get("slope") as string;
    const rating = formData.get("rating") as string;

    // Validate handicap values are 1-18 with no duplicates
    const handicaps = holes.map(h => h.handicap);
    const uniqueHandicaps = new Set(handicaps);
    if (uniqueHandicaps.size !== 18 || !handicaps.every(h => h >= 1 && h <= 18)) {
      toast({
        title: "Error",
        description: "Hole handicaps must be unique values from 1-18",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          city: city || null,
          state: state || null,
          slope: slope || null,
          rating: rating || null,
          holes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create course");
      }

      toast({ title: "Success", description: "Course added!" });
      router.push("/courses");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create course",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/courses">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Add Course</h2>
          <p className="text-muted-foreground">Enter course details and hole information</p>
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
              <Input id="name" name="name" placeholder="Pine Valley Golf Club" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" placeholder="Pine Valley" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" name="state" placeholder="NJ" maxLength={2} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="slope">Slope Rating</Label>
                <Input id="slope" name="slope" type="number" placeholder="155" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rating">Course Rating</Label>
                <Input id="rating" name="rating" type="number" step="0.1" placeholder="75.3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hole Information</CardTitle>
            <CardDescription>
              Enter par and handicap (stroke index) for each hole. Handicap 1 = hardest hole.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Front 9 */}
              <div>
                <h4 className="font-medium mb-2">Front 9</h4>
                <div className="grid grid-cols-9 gap-1 text-center text-xs">
                  {holes.slice(0, 9).map((hole, i) => (
                    <div key={hole.holeNumber} className="space-y-1">
                      <div className="font-medium bg-muted rounded p-1">{hole.holeNumber}</div>
                      <Input
                        type="number"
                        min="3"
                        max="5"
                        value={hole.par}
                        onChange={(e) => updateHole(i, "par", parseInt(e.target.value) || 4)}
                        className="h-8 text-center p-1"
                      />
                      <Input
                        type="number"
                        min="1"
                        max="18"
                        value={hole.handicap}
                        onChange={(e) => updateHole(i, "handicap", parseInt(e.target.value) || 1)}
                        className="h-8 text-center p-1"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-9 gap-1 text-center text-xs mt-1 text-muted-foreground">
                  <span>Hole</span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                </div>
              </div>

              {/* Back 9 */}
              <div>
                <h4 className="font-medium mb-2">Back 9</h4>
                <div className="grid grid-cols-9 gap-1 text-center text-xs">
                  {holes.slice(9, 18).map((hole, i) => (
                    <div key={hole.holeNumber} className="space-y-1">
                      <div className="font-medium bg-muted rounded p-1">{hole.holeNumber}</div>
                      <Input
                        type="number"
                        min="3"
                        max="5"
                        value={hole.par}
                        onChange={(e) => updateHole(i + 9, "par", parseInt(e.target.value) || 4)}
                        className="h-8 text-center p-1"
                      />
                      <Input
                        type="number"
                        min="1"
                        max="18"
                        value={hole.handicap}
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
          {isLoading ? "Saving..." : "Save Course"}
        </Button>
      </form>
    </div>
  );
}
