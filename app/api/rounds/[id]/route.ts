import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const round = await prisma.round.findUnique({
      where: { id },
      include: {
        course: {
          include: {
            holes: {
              orderBy: { holeNumber: "asc" },
            },
          },
        },
        players: {
          include: {
            player: true,
            scores: {
              orderBy: { holeNumber: "asc" },
            },
          },
        },
        matches: {
          include: {
            player1: {
              include: {
                player: true,
                scores: {
                  orderBy: { holeNumber: "asc" },
                },
              },
            },
            player2: {
              include: {
                player: true,
                scores: {
                  orderBy: { holeNumber: "asc" },
                },
              },
            },
            results: true,
            presses: true,
          },
        },
      },
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    return NextResponse.json({ round });
  } catch (error) {
    console.error("Error fetching round:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
