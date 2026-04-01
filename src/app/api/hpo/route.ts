import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// In-memory HPO state (shared via import in custom server)
// This is accessed from server.ts via dynamic import
let hpoEnabled = true;

export function getHPOEnabled() {
  return hpoEnabled;
}

export function setHPOEnabled(enabled: boolean) {
  hpoEnabled = enabled;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ hpoEnabled });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { enabled } = await request.json();
  hpoEnabled = !!enabled;

  return NextResponse.json({ hpoEnabled, message: `HPO ${hpoEnabled ? "enabled" : "disabled"}` });
}
