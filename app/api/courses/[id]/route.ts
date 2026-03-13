import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const course = await prisma.course.findFirst({
    where: {
      id: params.id,
      OR: [{ createdBy: session.user.id }, { isPublic: true }],
    },
    include: { holes: { orderBy: { holeNumber: "asc" } } },
  });

  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ course });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.course.findFirst({
    where: { id: params.id, createdBy: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, city, state, slope, rating, holes } = await request.json();
  if (!name) return NextResponse.json({ error: "Course name is required" }, { status: 400 });

  if (holes) {
    const handicaps = holes.map((h: { handicap: number }) => h.handicap);
    const unique = new Set(handicaps);
    if (unique.size !== 18 || !handicaps.every((h: number) => h >= 1 && h <= 18)) {
      return NextResponse.json({ error: "Hole handicaps must be unique values from 1-18" }, { status: 400 });
    }
  }

  try {
    const course = await prisma.course.update({
      where: { id: params.id },
      data: {
        name,
        city: city || null,
        state: state || null,
        slope: slope ? parseInt(slope) : null,
        rating: rating ? parseFloat(rating) : null,
        ...(holes && {
          holes: {
            deleteMany: {},
            create: holes.map((hole: { holeNumber: number; par: number; handicap: number; yardage?: number }) => ({
              holeNumber: hole.holeNumber,
              par: hole.par,
              handicap: hole.handicap,
              yardage: hole.yardage || null,
            })),
          },
        }),
      },
      include: { holes: { orderBy: { holeNumber: "asc" } } },
    });

    return NextResponse.json({ course });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "A course with that name already exists" }, { status: 400 });
    }
    console.error("Error updating course:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
