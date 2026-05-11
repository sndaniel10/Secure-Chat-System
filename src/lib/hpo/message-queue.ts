import { MAX_QUEUE_DEPTH } from "./config";

export interface QueuedPacket {
  type: "real";
  packet: Record<string, unknown>;
  recipientId: string;
}

const queues: Map<string, QueuedPacket[]> = new Map();

export function enqueueMessage(userId: string, packet: QueuedPacket): void {
  let q = queues.get(userId);
  if (!q) {
    q = [];
    queues.set(userId, q);
  }
  q.push(packet);
  // Cap queue at MAX_QUEUE_DEPTH (drop oldest)
  while (q.length > MAX_QUEUE_DEPTH) {
    q.shift();
  }
}

export function dequeueMessage(userId: string): QueuedPacket | null {
  const q = queues.get(userId);
  if (q && q.length > 0) {
    return q.shift() ?? null;
  }
  return null;
}

export function getQueueDepth(userId: string): number {
  return queues.get(userId)?.length ?? 0;
}

export function clearQueue(userId: string): void {
  queues.delete(userId);
}
