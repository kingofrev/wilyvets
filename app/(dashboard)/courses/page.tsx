"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Plus, MapPin } from "lucide-react";
import Link from "next/link";

interface Course {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  slope: number | null;
  rating: string | null;
  holes: Array<{ holeNumber: number; par: number; handicap: number }>;
}

export default function CoursesPage() {
  const { toast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  async function fetchCourses() {
    try {
      const response = await fetch("/api/courses");
      const data = await response.json();
      setCourses(data.courses || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load courses", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  function getTotalPar(holes: Course["holes"]) {
    return holes.reduce((sum, h) => sum + h.par, 0);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Courses</h2>
          <p className="text-muted-foreground">Your golf courses</p>
        </div>
        <Link href="/courses/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No courses yet</p>
            <Link href="/courses/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Course
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{course.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {[course.city, course.state].filter(Boolean).join(", ") || "No location"}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      {course.holes.length === 18 && (
                        <p className="font-medium">Par {getTotalPar(course.holes)}</p>
                      )}
                      {course.slope && <p className="text-muted-foreground">Slope: {course.slope}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
