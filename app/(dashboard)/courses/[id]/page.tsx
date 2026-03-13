"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Pencil } from "lucide-react";

interface Hole {
  holeNumber: number;
  par: number;
  handicap: number;
  yardage: number | null;
}

interface Course {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  slope: number | null;
  rating: string | null;
  holes: Hole[];
}

export default function CourseDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/courses/${params.id}`)
      .then((r) => r.json())
      .then((d) => setCourse(d.course))
      .catch(() => toast({ title: "Error", description: "Failed to load course", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  if (!course) return <div className="text-center py-8 text-destructive">Course not found.</div>;

  const front = course.holes.filter((h) => h.holeNumber <= 9);
  const back = course.holes.filter((h) => h.holeNumber >= 10);
  const totalPar = course.holes.reduce((s, h) => s + h.par, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/courses">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{course.name}</h2>
          {(course.city || course.state) && (
            <p className="text-muted-foreground text-sm">
              {[course.city, course.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <Link href={`/courses/${course.id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      {/* Course info */}
      <div className="flex gap-4 text-sm">
        {totalPar > 0 && (
          <div className="bg-muted rounded-lg px-4 py-2 text-center">
            <div className="font-semibold">{totalPar}</div>
            <div className="text-muted-foreground text-xs">Par</div>
          </div>
        )}
        {course.slope && (
          <div className="bg-muted rounded-lg px-4 py-2 text-center">
            <div className="font-semibold">{course.slope}</div>
            <div className="text-muted-foreground text-xs">Slope</div>
          </div>
        )}
        {course.rating && (
          <div className="bg-muted rounded-lg px-4 py-2 text-center">
            <div className="font-semibold">{course.rating}</div>
            <div className="text-muted-foreground text-xs">Rating</div>
          </div>
        )}
      </div>

      {/* Hole table */}
      {course.holes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Hole Info</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <HoleTable label="Front 9" holes={front} />
            <HoleTable label="Back 9" holes={back} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HoleTable({ label, holes }: { label: string; holes: Hole[] }) {
  return (
    <div className="px-4 pb-3">
      <p className="text-xs font-medium text-muted-foreground mb-1 pt-3">{label}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-center">
          <thead>
            <tr className="text-muted-foreground">
              <td className="py-1 text-left w-16">Hole</td>
              {holes.map((h) => <td key={h.holeNumber} className="py-1 w-8">{h.holeNumber}</td>)}
              <td className="py-1 w-10 font-medium">Out</td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 text-left text-muted-foreground">Par</td>
              {holes.map((h) => <td key={h.holeNumber} className="py-1">{h.par}</td>)}
              <td className="py-1 font-medium">{holes.reduce((s, h) => s + h.par, 0)}</td>
            </tr>
            <tr>
              <td className="py-1 text-left text-muted-foreground">Hdcp</td>
              {holes.map((h) => <td key={h.holeNumber} className="py-1">{h.handicap}</td>)}
              <td className="py-1">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
