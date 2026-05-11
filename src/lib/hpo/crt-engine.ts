import { manager } from "@/lib/ws/manager";
import { CRT_INTERVAL_MS, isHpoEnabled } from "./config";
import { dequeueMessage, getQueueDepth } from "./message-queue";
import {
  generateCoverPacket,
  selectBlockSize,
  wrapRealPacket,
} from "./cover-traffic";

let intervalHandle: NodeJS.Timeout | null = null;
let totalCoverSent = 0;
let totalRealSent = 0;

function tick(): void {
  if (!isHpoEnabled()) return;

  for (const userId of manager.getOnlineUserIds()) {
    const queued = dequeueMessage(userId);

    if (queued?.type === "real" && queued.packet) {
      const jsonPayload = JSON.stringify(queued.packet);
      const blockSize = selectBlockSize(Buffer.byteLength(jsonPayload, "utf8"));
      const wirePacket = wrapRealPacket(jsonPayload, blockSize);
      manager.sendToUser(userId, { type: "hpo:packet", ...wirePacket });
      totalRealSent += 1;
    } else {
      const cover = generateCoverPacket();
      manager.sendToUser(userId, { type: "hpo:packet", ...cover });
      totalCoverSent += 1;
    }
  }
}

export function startCrt(): void {
  if (intervalHandle) return;
  console.log(`[CRT] Starting engine (interval: ${CRT_INTERVAL_MS}ms)`);
  intervalHandle = setInterval(() => {
    try {
      tick();
    } catch (err) {
      console.error("[CRT] Error in tick:", err);
    }
  }, CRT_INTERVAL_MS);
}

export function stopCrt(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[CRT] Engine stopped");
  }
}

export function getHpoStatus(userId?: string) {
  return {
    crtInterval: CRT_INTERVAL_MS,
    coverPacketsSent: totalCoverSent,
    realPacketsSent: totalRealSent,
    queueDepth: userId ? getQueueDepth(userId) : 0,
    hpoEnabled: isHpoEnabled(),
  };
}
