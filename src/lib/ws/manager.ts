import type { WebSocket } from "ws";

class ConnectionManager {
  private connections = new Map<string, WebSocket>();
  private rooms = new Map<string, Set<string>>();

  async connect(ws: WebSocket, userId: string): Promise<void> {
    this.connections.set(userId, ws);
    this.rooms.set(userId, new Set());

    // Tell the new connection about everyone already online
    for (const onlineId of this.connections.keys()) {
      if (onlineId !== userId) {
        this.sendToUser(userId, { type: "user:online", userId: onlineId });
      }
    }

    // Notify others
    this.broadcast({ type: "user:online", userId }, userId);
  }

  disconnect(userId: string): void {
    this.connections.delete(userId);
    this.rooms.delete(userId);
    this.broadcast({ type: "user:offline", userId });
  }

  joinRoom(userId: string, conversationId: string): void {
    this.rooms.get(userId)?.add(conversationId);
  }

  sendToUser(userId: string, message: Record<string, unknown>): void {
    const ws = this.connections.get(userId);
    if (!ws) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Drop on error; the close handler will clean up.
    }
  }

  broadcast(message: Record<string, unknown>, excludeUserId?: string): void {
    for (const [uid] of this.connections) {
      if (uid !== excludeUserId) this.sendToUser(uid, message);
    }
  }

  broadcastToRoom(
    conversationId: string,
    message: Record<string, unknown>,
    excludeUserId?: string
  ): void {
    for (const [uid, rooms] of this.rooms) {
      if (rooms.has(conversationId) && uid !== excludeUserId) {
        this.sendToUser(uid, message);
      }
    }
  }

  getOnlineUserIds(): string[] {
    return [...this.connections.keys()];
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _wsManager: ConnectionManager | undefined;
}

export const manager: ConnectionManager =
  global._wsManager ?? (global._wsManager = new ConnectionManager());
