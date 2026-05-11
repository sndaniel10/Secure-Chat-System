import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-server";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (!q) return NextResponse.json({ users: [] });

  const db = await getDb();
  const results = await db
    .collection("users")
    .find(
      {
        username: { $regex: escapeRegex(q), $options: "i" },
        _id: { $ne: new ObjectId(user.id) },
      },
      { projection: { _id: 1, username: 1, display_name: 1 } }
    )
    .limit(10)
    .toArray();

  return NextResponse.json({
    users: results.map((u) => ({
      id: u._id.toString(),
      username: u.username,
      displayName: u.display_name ?? u.username,
    })),
  });
}
