import { ObjectId, type Db, type Document } from "mongodb";

export interface ParticipantInfo {
  user: { id: string; username: string; displayName: string };
}

export interface FormattedConversation {
  id: string;
  participants: ParticipantInfo[];
  messages: Array<{ id: string; timestamp: string; senderId: string }>;
  createdAt: string;
  updatedAt: string;
}

function tryObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export async function formatConversation(
  db: Db,
  conv: Document
): Promise<FormattedConversation> {
  const participants: ParticipantInfo[] = [];
  for (const pid of (conv.participant_ids ?? []) as string[]) {
    const oid = tryObjectId(pid);
    if (!oid) continue;
    const user = await db
      .collection("users")
      .findOne(
        { _id: oid },
        { projection: { _id: 1, username: 1, display_name: 1 } }
      );
    if (user) {
      participants.push({
        user: {
          id: user._id.toString(),
          username: user.username,
          displayName: user.display_name ?? user.username,
        },
      });
    }
  }

  const lastMsg = await db
    .collection("messages")
    .findOne({ conversation_id: conv._id.toString() }, { sort: { timestamp: -1 } });

  const messages = lastMsg
    ? [
        {
          id: lastMsg._id.toString(),
          timestamp: (lastMsg.timestamp as Date).toISOString(),
          senderId: lastMsg.sender_id as string,
        },
      ]
    : [];

  return {
    id: conv._id.toString(),
    participants,
    messages,
    createdAt: (conv.created_at as Date).toISOString(),
    updatedAt: (conv.updated_at as Date).toISOString(),
  };
}

export { tryObjectId };
