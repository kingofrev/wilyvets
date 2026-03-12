import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    await prisma.user.findFirst()
    return NextResponse.json({ db: "ok" })
  } catch (e) {
    return NextResponse.json({ db: "error", message: String(e) })
  }
}
