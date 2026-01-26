import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const courses = await prisma.course.findMany({
      where: {
        OR: [
          { createdBy: session.user.id },
          { isPublic: true },
        ],
      },
      include: {
        holes: {
          orderBy: { holeNumber: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ courses });
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, city, state, slope, rating, holes } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    const course = await prisma.course.create({
      data: {
        name,
        city: city || null,
        state: state || null,
        slope: slope ? parseInt(slope) : null,
        rating: rating ? parseFloat(rating) : null,
        createdBy: session.user.id,
        holes: {
          create: holes?.map((hole: any) => ({
            holeNumber: hole.holeNumber,
            par: hole.par,
            handicap: hole.handicap,
            yardage: hole.yardage || null,
          })) || [],
        },
      },
      include: {
        holes: {
          orderBy: { holeNumber: "asc" },
        },
      },
    });

    return NextResponse.json({ course });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Course already exists" }, { status: 400 });
    }
    console.error("Error creating course:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
