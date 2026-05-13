import type { WebSocket } from "ws";

class ConnectionManager {
  // Multiple sockets per userId to support multi-session (e.g. localhost + network IP)
  private connections = new Map<string, Set<WebSocket>>();
  private rooms = new Map<string, Set<string>>();

  async connect(ws: WebSocket, userId: string): Promise<void> {
    const isFirstSession = !this.connections.has(userId);

    if (isFirstSession) {
      this.connections.set(userId, new Set());
      this.rooms.set(userId, new Set());
    }
    this.connections.get(userId)!.add(ws);

    // Tell the new socket about everyone already online
    for (const onlineId of this.connections.keys()) {
      if (onlineId !== userId) {
        this.sendToSocket(ws, { type: "user:online", userId: onlineId });
      }
    }

    // Notify others only when the first session for this user connects
    if (isFirstSession) {
      this.broadcast({ type: "user:online", userId }, userId);
    }
  }

  disconnect(userId: string, ws: WebSocket): void {
    const sockets = this.connections.get(userId);
    if (!sockets) return;

    sockets.delete(ws);

    if (sockets.size === 0) {
      // Last session gone — user is now offline
      this.connections.delete(userId);
      this.rooms.delete(userId);
      this.broadcast({ type: "user:offline", userId });
    }
  }

  joinRoom(userId: string, conversationId: string): void {
    this.rooms.get(userId)?.add(conversationId);
  }

  sendToUser(userId: string, message: Record<string, unknown>): void {
    const sockets = this.connections.get(userId);
    if (!sockets) return;
    for (const ws of sockets) {
      this.sendToSocket(ws, message);
    }
  }

  private sendToSocket(ws: WebSocket, message: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Drop on error; the close handler will clean up
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
    return (this.connections.get(userId)?.size ?? 0) > 0;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _wsManager: ConnectionManager | undefined;
}

export const manager: ConnectionManager =
  global._wsManager ?? (global._wsManager = new ConnectionManager());
