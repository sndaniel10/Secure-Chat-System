import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const doc = await db.collection("key_vaults").findOne({ userId: user.id });
  return NextResponse.json({ vault: doc?.encryptedVault ?? null });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { encryptedVault } = await request.json();
  if (!encryptedVault) return NextResponse.json({ error: "Missing vault" }, { status: 400 });

  const db = await getDb();
  await db.collection("key_vaults").updateOne(
    { userId: user.id },
    { $set: { userId: user.id, encryptedVault, updatedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
