import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { getVapidPublicKey } from "@/lib/push/vapid";

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await request.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("push_subscriptions").updateOne(
    { userId: user.id, "subscription.endpoint": subscription.endpoint },
    { $set: { userId: user.id, subscription, updatedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await request.json();
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("push_subscriptions").deleteOne({
    userId: user.id,
    "subscription.endpoint": endpoint,
  });

  return NextResponse.json({ ok: true });
}
