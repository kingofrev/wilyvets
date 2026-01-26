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

    const players = await prisma.player.findMany({
      where: { createdById: session.user.id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      players: players.map((p) => ({
        ...p,
        handicap: p.handicap?.toString() || null,
      })),
    });
  } catch (error) {
    console.error("Error fetching players:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, handicap, email } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const player = await prisma.player.create({
      data: {
        name,
        handicap: handicap ? parseFloat(handicap) : null,
        email: email || null,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({
      player: {
        ...player,
        handicap: player.handicap?.toString() || null,
      },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Player with this name already exists" }, { status: 400 });
    }
    console.error("Error creating player:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
