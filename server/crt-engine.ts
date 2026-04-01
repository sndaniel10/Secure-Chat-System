import { Server as SocketIOServer } from "socket.io";
import {
  ServerToClientEvents,
  ClientToServerEvents,
  HPOStatus,
} from "../src/socket/events";
import { CRT_INTERVAL_MS, HPO_ENABLED } from "./config";
import { dequeueMessage, getQueueDepth } from "./message-queue";
import { getOnlineUsers } from "./socket-handlers";
import {
  generateCoverPacket,
  wrapRealPacket,
  selectBlockSize,
} from "./cover-traffic";

let crtTimer: NodeJS.Timeout | null = null;
let totalCoverSent = 0;
let totalRealSent = 0;

/**
 * Start the Constant Rate Transmission engine.
 * Dispatches one packet per connected user every CRT_INTERVAL_MS.
 * Real messages from the queue are sent when available; otherwise cover traffic.
 */
export function startCRT(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
): void {
  if (!HPO_ENABLED) {
    console.log("[CRT] HPO disabled, CRT engine not started");
    return;
  }

  if (crtTimer) {
    clearInterval(crtTimer);
  }

  console.log(
    `[CRT] Starting Constant Rate Transmission engine (interval: ${CRT_INTERVAL_MS}ms)`
  );

  crtTimer = setInterval(() => {
    const onlineUsers = getOnlineUsers();

    for (const [userId, socketId] of onlineUsers.entries()) {
      const queuedMessage = dequeueMessage(userId);

      if (queuedMessage && queuedMessage.type === "real" && queuedMessage.packet) {
        // Real message available - wrap it in HPO format and dispatch
        const jsonPayload = JSON.stringify(queuedMessage.packet);
        const blockSize = selectBlockSize(jsonPayload.length);
        const wirePacket = wrapRealPacket(jsonPayload, blockSize);

        io.to(socketId).emit("hpo:packet", wirePacket);
        totalRealSent++;
      } else {
        // No real message - send cover traffic to maintain constant rate
        const coverPacket = generateCoverPacket();
        io.to(socketId).emit("hpo:packet", coverPacket);
        totalCoverSent++;
      }
    }
  }, CRT_INTERVAL_MS);
}

/**
 * Stop the CRT engine.
 */
export function stopCRT(): void {
  if (crtTimer) {
    clearInterval(crtTimer);
    crtTimer = null;
    console.log("[CRT] Engine stopped");
  }
}

/**
 * Get current HPO status metrics.
 */
export function getHPOStatus(userId?: string): HPOStatus {
  return {
    crtInterval: CRT_INTERVAL_MS,
    coverPacketsSent: totalCoverSent,
    realPacketsSent: totalRealSent,
    queueDepth: userId ? getQueueDepth(userId) : 0,
    hpoEnabled: HPO_ENABLED,
  };
}
