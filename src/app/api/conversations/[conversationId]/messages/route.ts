import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-server";
import { tryObjectId } from "@/lib/conversations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { conversationId } = await params;
  const convOid = tryObjectId(conversationId);
  if (!convOid) {
    return NextResponse.json({ detail: "Not a participant" }, { status: 403 });
  }

  const db = await getDb();
  const conv = await db.collection("conversations").findOne({ _id: convOid });
  if (!conv || !((conv.participant_ids ?? []) as string[]).includes(user.id)) {
    return NextResponse.json({ detail: "Not a participant" }, { status: 403 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const query: Record<string, unknown> = { conversation_id: conversationId };
  if (cursor) {
    const cursorOid = tryObjectId(cursor);
    if (cursorOid) query._id = { $gt: cursorOid };
  }

  const msgs = await db
    .collection("messages")
    .find(query)
    .sort({ timestamp: -1 })
    .limit(50)
    .toArray();
  msgs.reverse();

  const messages = msgs.map((msg) => ({
    id: msg._id.toString(),
    senderId: msg.sender_id,
    recipientId: msg.recipient_id,
    ciphertext: msg.ciphertext,
    ratchetHeader: msg.ratchet_header ?? "",
    timestamp: (msg.timestamp as Date).toISOString(),
    delivered: msg.delivered ?? false,
  }));

  return NextResponse.json({ messages });
}
