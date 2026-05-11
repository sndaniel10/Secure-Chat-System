import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { isHpoEnabled, setHpoEnabled } from "@/lib/hpo/config";
import { hpoToggleSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ hpoEnabled: isHpoEnabled() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = hpoToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 422 });
  }

  setHpoEnabled(parsed.data.enabled);
  return NextResponse.json({ hpoEnabled: isHpoEnabled() });
}
