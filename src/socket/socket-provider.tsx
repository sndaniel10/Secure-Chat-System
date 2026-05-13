"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { EncryptedPacket, HPOWirePacket } from "./events";

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface SocketContextType {
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
}

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  onlineUsers: new Set(),
  sendMessage: async () => ({ success: false }),
  joinConversation: () => {},
  onMessage: () => () => {},
  onHPOPacket: () => () => {},
  sendTyping: () => {},
  sendStopTyping: () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Handlers stored in refs so they survive re-renders
  const messageHandlersRef = useRef<Set<(data: EncryptedPacket) => void>>(new Set());
  const hpoHandlersRef = useRef<Set<(data: HPOWirePacket) => void>>(new Set());

  // Pending message acks: requestId -> {resolve}
  const pendingAcksRef = useRef<Map<string, { resolve: (val: { success: boolean; messageId?: string }) => void }>>(new Map());

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected");
        setIsConnected(true);
        reconnectDelay = 1000; // Reset backoff
      };

      ws.onclose = () => {
        // Guard: if wsRef already points to a newer socket, this close is stale
        // (happens when effect cleanup closes the old socket after a new one is created)
        if (wsRef.current !== ws) return;
        console.log("[WS] Disconnected");
        setIsConnected(false);
        wsRef.current = null;
        // Reconnect with exponential backoff
        reconnectTimeout = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect();
        }, reconnectDelay);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (err) {
          console.error("[WS] Failed to parse message:", err);
        }
      };
    }

    function handleServerMessage(msg: Record<string, unknown>) {
      const type = msg.type as string;

      switch (type) {
        case "auth:success":
          console.log("[WS] Authenticated");
          break;

        case "user:online":
          setOnlineUsers((prev) => new Set([...prev, msg.userId as string]));
          break;

        case "user:offline":
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            next.delete(msg.userId as string);
            return next;
          });
          break;

        case "message:receive":
          for (const handler of messageHandlersRef.current) {
            handler(msg.data as EncryptedPacket);
          }
          break;

        case "message:ack": {
          const requestId = msg.requestId as string;
          const pending = pendingAcksRef.current.get(requestId);
          if (pending) {
            pending.resolve({
              success: msg.success as boolean,
              messageId: msg.messageId as string | undefined,
            });
            pendingAcksRef.current.delete(requestId);
          }
          break;
        }

        case "hpo:packet":
          for (const handler of hpoHandlersRef.current) {
            handler(msg as unknown as HPOWirePacket);
          }
          break;

        case "user:typing":
        case "user:stopTyping":
          // Handled via broadcast — components listen through onMessage if needed
          // For now, dispatch as a message:receive-like event
          break;

        default:
          break;
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [isAuthenticated, token]);

  const sendJSON = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendMessage = useCallback(
    async (data: EncryptedPacket): Promise<{ success: boolean; messageId?: string }> => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return { success: false };
      }

      const requestId = generateId();

      return new Promise((resolve) => {
        // Timeout after 10 seconds
        const timeout = setTimeout(() => {
          pendingAcksRef.current.delete(requestId);
          resolve({ success: false });
        }, 10000);

        pendingAcksRef.current.set(requestId, {
          resolve: (val) => {
            clearTimeout(timeout);
            resolve(val);
          },
        });

        sendJSON({
          type: "message:send",
          requestId,
          data,
        });
      });
    },
    [sendJSON]
  );

  const joinConversation = useCallback(
    (conversationId: string) => {
      sendJSON({ type: "conversation:join", conversationId });
    },
    [sendJSON]
  );

  const onMessage = useCallback(
    (handler: (data: EncryptedPacket) => void) => {
      messageHandlersRef.current.add(handler);
      return () => {
        messageHandlersRef.current.delete(handler);
      };
    },
    []
  );

  const onHPOPacket = useCallback(
    (handler: (data: HPOWirePacket) => void) => {
      hpoHandlersRef.current.add(handler);
      return () => {
        hpoHandlersRef.current.delete(handler);
      };
    },
    []
  );

  const sendTyping = useCallback(
    (conversationId: string) => {
      sendJSON({ type: "user:typing", conversationId });
    },
    [sendJSON]
  );

  const sendStopTyping = useCallback(
    (conversationId: string) => {
      sendJSON({ type: "user:stopTyping", conversationId });
    },
    [sendJSON]
  );

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        onlineUsers,
        sendMessage,
        joinConversation,
        onMessage,
        onHPOPacket,
        sendTyping,
        sendStopTyping,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
