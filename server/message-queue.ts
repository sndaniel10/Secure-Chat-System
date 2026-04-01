import { EncryptedPacket } from "../src/socket/events";
import { MAX_QUEUE_DEPTH } from "./config";

export interface HPOPacketData {
  type: "real" | "cover";
  packet: EncryptedPacket | null;
  recipientId: string;
}

// Per-user outbound queue
const queues = new Map<string, HPOPacketData[]>();

export function enqueueMessage(userId: string, packet: HPOPacketData): void {
  if (!queues.has(userId)) {
    queues.set(userId, []);
  }

  const queue = queues.get(userId)!;

  // Drop oldest if queue is full
  if (queue.length >= MAX_QUEUE_DEPTH) {
    queue.shift();
  }

  queue.push(packet);
}

export function dequeueMessage(userId: string): HPOPacketData | null {
  const queue = queues.get(userId);
  if (!queue || queue.length === 0) return null;
  return queue.shift()!;
}

export function getQueueDepth(userId: string): number {
  return queues.get(userId)?.length ?? 0;
}

export function clearQueue(userId: string): void {
  queues.delete(userId);
}
