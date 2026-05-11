import type { WebSocket } from "ws";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { decodeAccessToken } from "@/lib/auth-server";
import { manager } from "./manager";
import { isHpoEnabled } from "@/lib/hpo/config";
import { enqueueMessage } from "@/lib/hpo/message-queue";

export async function handleConnection(ws: WebSocket, token: string): Promise<void> {
  const payload = await decodeAccessToken(token);
  if (!payload?.sub) {
    ws.close(4001, "Invalid token");
    return;
  }

  const userId = payload.sub;
  await manager.connect(ws, userId);
  ws.send(JSON.stringify({ type: "auth:success", userId }));
  console.log(`[WS] User connected: ${userId}`);

  ws.on("message", async (raw) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const msgType = data.type as string;

    if (msgType === "conversation:join") {
      const convId = (data.conversationId ?? data.conversation_id) as
        | string
        | undefined;
      if (convId) manager.joinRoom(userId, convId);
    } else if (msgType === "message:send") {
      await handleMessageSend(userId, data);
    } else if (msgType === "user:typing" || msgType === "user:stopTyping") {
      const convId = (data.conversationId ?? data.conversation_id) as
        | string
        | undefined;
      if (convId) {
        manager.broadcastToRoom(
          convId,
          { type: msgType, userId, conversationId: convId },
          userId
        );
      }
    }
  });

  ws.on("close", () => {
    manager.disconnect(userId);
    console.log(`[WS] User disconnected: ${userId}`);
  });

  ws.on("error", (err) => {
    console.error(`[WS] Error for user ${userId}:`, err);
  });
}

async function handleMessageSend(
  senderId: string,
  data: Record<string, unknown>
): Promise<void> {
  const msgData = (data.data ?? {}) as Record<string, unknown>;
  const requestId = (data.requestId ?? data.request_id) as string | undefined;

  try {
    const db = await getDb();
    const now = new Date();
    const conversationId = msgData.conversationId as string | undefined;
    const recipientId = msgData.recipientId as string | undefined;

    const result = await db.collection("messages").insertOne({
      conversation_id: conversationId,
      sender_id: senderId,
      recipient_id: recipientId,
      ciphertext: (msgData.ciphertext as string) ?? "",
      ratchet_header: (msgData.ratchetHeader as string) ?? "",
      timestamp: now,
      delivered: false,
    });
    const messageId = result.insertedId.toString();

    if (conversationId) {
      try {
        await db
          .collection("conversations")
          .updateOne(
            { _id: new ObjectId(conversationId) },
            { $set: { updated_at: now } }
          );
      } catch {
        // Invalid ObjectId — ignore
      }
    }

    const packet = {
      ...msgData,
      id: messageId,
      timestamp: now.getTime(),
    };

    if (recipientId && isHpoEnabled() && manager.isOnline(recipientId)) {
      enqueueMessage(recipientId, { type: "real", packet, recipientId });
    } else if (recipientId && manager.isOnline(recipientId)) {
      manager.sendToUser(recipientId, { type: "message:receive", data: packet });
    }

    manager.sendToUser(senderId, {
      type: "message:ack",
      requestId,
      success: true,
      messageId,
    });
  } catch (err) {
    console.error("[WS] Error saving message:", err);
    manager.sendToUser(senderId, {
      type: "message:ack",
      requestId,
      success: false,
    });
  }
}
