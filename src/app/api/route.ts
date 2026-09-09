import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({ message: "Hello, world!" });

  } catch (err: any) {
    console.error("[root GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load resource: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}