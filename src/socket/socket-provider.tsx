"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { useSession } from "next-auth/react";
import {
  ServerToClientEvents,
  ClientToServerEvents,
  HPOWirePacket,
  EncryptedPacket,
} from "./events";
import { SOCKET_PATH } from "@/lib/constants";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextType {
  socket: TypedSocket | null;
  isConnected: boolean;
  onlineUsers: Set<string>;
  sendMessage: (
    data: EncryptedPacket
  ) => Promise<{ success: boolean; messageId?: string }>;
  joinConversation: (conversationId: string) => void;
  onMessage: (handler: (data: EncryptedPacket) => void) => () => void;
  onHPOPacket: (handler: (data: HPOWirePacket) => void) => () => void;
  sendTyping: (conversationId: string) => void;
  sendStopTyping: (conversationId: string) => void;
  onTyping: (
    handler: (data: { userId: string; conversationId: string }) => void
  ) => () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  onlineUsers: new Set(),
  sendMessage: async () => ({ success: false }),
  joinConversation: () => {},
  onMessage: () => () => {},
  onHPOPacket: () => () => {},
  sendTyping: () => {},
  sendStopTyping: () => {},
  onTyping: () => () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session?.user?.id) return;

    const newSocket: TypedSocket = io({
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      console.log("[Socket] Connected");
      setIsConnected(true);

      // Authenticate with server
      newSocket.emit("user:authenticate", session.user.id, (ack) => {
        if (ack.success) {
          console.log("[Socket] Authenticated");
        }
      });
    });

    newSocket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
      setIsConnected(false);
    });

    newSocket.on("user:online", ({ userId }) => {
      setOnlineUsers((prev) => new Set([...prev, userId]));
    });

    newSocket.on("user:offline", ({ userId }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [session?.user?.id]);

  const sendMessage = useCallback(
    async (
      data: EncryptedPacket
    ): Promise<{ success: boolean; messageId?: string }> => {
      if (!socket?.connected) return { success: false };

      return new Promise((resolve) => {
        socket.emit("message:send", data, (ack) => {
          resolve(ack);
        });
      });
    },
    [socket]
  );

  const joinConversation = useCallback(
    (conversationId: string) => {
      if (socket?.connected) {
        socket.emit("conversation:join", conversationId);
      }
    },
    [socket]
  );

  const onMessage = useCallback(
    (handler: (data: EncryptedPacket) => void) => {
      if (!socket) return () => {};
      socket.on("message:receive", handler);
      return () => {
        socket.off("message:receive", handler);
      };
    },
    [socket]
  );

  const onHPOPacket = useCallback(
    (handler: (data: HPOWirePacket) => void) => {
      if (!socket) return () => {};
      socket.on("hpo:packet", handler);
      return () => {
        socket.off("hpo:packet", handler);
      };
    },
    [socket]
  );

  const sendTyping = useCallback(
    (conversationId: string) => {
      if (socket?.connected) {
        socket.emit("user:typing", conversationId);
      }
    },
    [socket]
  );

  const sendStopTyping = useCallback(
    (conversationId: string) => {
      if (socket?.connected) {
        socket.emit("user:stopTyping", conversationId);
      }
    },
    [socket]
  );

  const onTyping = useCallback(
    (
      handler: (data: { userId: string; conversationId: string }) => void
    ) => {
      if (!socket) return () => {};
      socket.on("user:typing", handler);
      socket.on("user:stopTyping", (data) =>
        handler({ ...data, userId: "" })
      );
      return () => {
        socket.off("user:typing", handler);
      };
    },
    [socket]
  );

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        onlineUsers,
        sendMessage,
        joinConversation,
        onMessage,
        onHPOPacket,
        sendTyping,
        sendStopTyping,
        onTyping,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
