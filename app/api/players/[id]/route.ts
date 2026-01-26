import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, handicap, email } = await request.json();

    const player = await prisma.player.update({
      where: { id: params.id, createdById: session.user.id },
      data: {
        name,
        handicap: handicap ? parseFloat(handicap) : null,
        email: email || null,
      },
    });

    return NextResponse.json({
      player: { ...player, handicap: player.handicap?.toString() || null },
    });
  } catch (error) {
    console.error("Error updating player:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.player.delete({
      where: { id: params.id, createdById: session.user.id },
    });

    return NextResponse.json({ message: "Player deleted" });
  } catch (error) {
    console.error("Error deleting player:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
