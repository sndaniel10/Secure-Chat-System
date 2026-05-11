import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-server";
import { formatConversation, tryObjectId } from "@/lib/conversations";
import { conversationCreateSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const convs = await db
    .collection("conversations")
    .find({ participant_ids: user.id })
    .sort({ updated_at: -1 })
    .limit(100)
    .toArray();

  const conversations = await Promise.all(
    convs.map((c) => formatConversation(db, c))
  );
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = conversationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ detail: "Recipient ID required" }, { status: 400 });
  }

  const db = await getDb();
  const recipientOid = tryObjectId(parsed.data.recipientId);
  const recipient = recipientOid
    ? await db.collection("users").findOne({ _id: recipientOid })
    : null;

  if (!recipient) {
    return NextResponse.json({ detail: "Recipient not found" }, { status: 404 });
  }

  const existing = await db
    .collection("conversations")
    .findOne({ participant_ids: { $all: [user.id, parsed.data.recipientId] } });

  if (existing) {
    return NextResponse.json({
      conversation: await formatConversation(db, existing),
    });
  }

  const now = new Date();
  const result = await db.collection("conversations").insertOne({
    created_at: now,
    updated_at: now,
    participant_ids: [user.id, parsed.data.recipientId],
  });

  const convDoc = {
    _id: result.insertedId,
    created_at: now,
    updated_at: now,
    participant_ids: [user.id, parsed.data.recipientId],
  };

  return NextResponse.json({
    conversation: await formatConversation(db, convDoc),
  });
}
