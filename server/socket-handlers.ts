import { Server as SocketIOServer, Socket } from "socket.io";
import {
  ServerToClientEvents,
  ClientToServerEvents,
  EncryptedPacket,
} from "../src/socket/events";
import { createServerPrisma } from "./prisma-import";
import { enqueueMessage, HPOPacketData } from "./message-queue";
import { HPO_ENABLED } from "./config";

const prisma = createServerPrisma();

// Track online users: userId -> socketId
const onlineUsers = new Map<string, string>();
// Track socket -> userId for cleanup
const socketToUser = new Map<string, string>();

export function getOnlineUsers() {
  return onlineUsers;
}

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function setupSocketHandlers(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
) {
  io.on("connection", (socket: TypedSocket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    socket.on("user:authenticate", (userId: string, callback) => {
      onlineUsers.set(userId, socket.id);
      socketToUser.set(socket.id, userId);

      // Send the currently-online user list to the newly connected user
      for (const [onlineId] of onlineUsers) {
        if (onlineId !== userId) {
          socket.emit("user:online", { userId: onlineId });
        }
      }

      // Notify others that this user came online
      socket.broadcast.emit("user:online", { userId });

      console.log(`[Socket] User authenticated: ${userId}`);
      callback({ success: true });
    });

    socket.on("conversation:join", (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      console.log(
        `[Socket] ${socket.id} joined conversation:${conversationId}`
      );
    });

    socket.on("message:send", async (data: EncryptedPacket, callback) => {
      try {
        // Store encrypted message in database
        const message = await prisma.message.create({
          data: {
            conversationId: data.conversationId,
            senderId: data.senderId,
            recipientId: data.recipientId,
            ciphertext: data.ciphertext,
            ratchetHeader: data.ratchetHeader,
          },
        });

        // Update conversation timestamp
        await prisma.conversation.update({
          where: { id: data.conversationId },
          data: { updatedAt: new Date() },
        });

        const packet: EncryptedPacket = {
          ...data,
          id: message.id,
          timestamp: message.timestamp.getTime(),
        };

        if (HPO_ENABLED) {
          // Route through HPO message queue for CRT dispatch
          const recipientSocket = onlineUsers.get(data.recipientId);
          if (recipientSocket) {
            const hpoPacket: HPOPacketData = {
              type: "real",
              packet,
              recipientId: data.recipientId,
            };
            enqueueMessage(data.recipientId, hpoPacket);
          }
        } else {
          // Direct dispatch (no HPO)
          const recipientSocket = onlineUsers.get(data.recipientId);
          if (recipientSocket) {
            io.to(recipientSocket).emit("message:receive", packet);
          }
        }

        callback({ success: true, messageId: message.id });
      } catch (error) {
        console.error("[Socket] Error saving message:", error);
        callback({ success: false });
      }
    });

    socket.on("user:typing", (conversationId: string) => {
      const userId = socketToUser.get(socket.id);
      if (userId) {
        socket
          .to(`conversation:${conversationId}`)
          .emit("user:typing", { userId, conversationId });
      }
    });

    socket.on("user:stopTyping", (conversationId: string) => {
      const userId = socketToUser.get(socket.id);
      if (userId) {
        socket
          .to(`conversation:${conversationId}`)
          .emit("user:stopTyping", { userId, conversationId });
      }
    });

    socket.on("disconnect", () => {
      const userId = socketToUser.get(socket.id);
      if (userId) {
        onlineUsers.delete(userId);
        socketToUser.delete(socket.id);
        socket.broadcast.emit("user:offline", { userId });
        console.log(`[Socket] User disconnected: ${userId}`);
      }
    });
  });
}
