"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { authFetch } from "@/lib/auth-client";
import { useParams } from "next/navigation";
import { ConversationList } from "@/components/chat/conversation-list";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";
import { MessageList, DisplayMessage } from "@/components/chat/message-list";
import { MessageInput } from "@/components/chat/message-input";
import { HPOStatusPanel } from "@/components/hpo/hpo-status";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/socket/socket-provider";
import { EncryptedPacket, HPOWirePacket } from "@/socket/events";
import { Shield, LogOut, Lock } from "lucide-react";
import {
  ratchetEncrypt,
  ratchetDecrypt,
  hasSession,
  initSenderSession,
  initReceiverSession,
  EncryptedMessage,
} from "@/crypto/ratchet-session";
import { x3dhInitiate, x3dhRespond } from "@/crypto/x3dh";
import { fetchKeyBundle } from "@/crypto/key-manager";
import { getIdentityKey, getSignedPreKey, getCachedPlaintext, setCachedPlaintext, deleteSession, initCryptoStore } from "@/crypto/store";
import { fromHex } from "@/crypto/utils";

/**
 * Set up a receiver X3DH session from an initial message's headers.
 */
async function setupReceiverX3DH(
  conversationId: string,
  encMsg: EncryptedMessage
): Promise<boolean> {
  const signedPreKey = await getSignedPreKey();
  if (!signedPreKey || !encMsg.header.identityKey || !encMsg.header.ephemeralKey) return false;

  const sharedSecret = await x3dhRespond(
    encMsg.header.identityKey,
    encMsg.header.ephemeralKey,
    encMsg.header.usedOneTimePreKeyId
  );
  await initReceiverSession(conversationId, sharedSecret, {
    publicKey: fromHex(signedPreKey.publicKey),
    privateKey: fromHex(signedPreKey.privateKey),
  });
  return true;
}

/**
 * Decrypt an encrypted message, handling X3DH initial handshake if needed.
 * If decryption fails with a stale session, resets and retries X3DH.
 */
async function decryptMessage(
  conversationId: string,
  encMsg: EncryptedMessage
): Promise<string> {
  const isX3DHInitial = !!(encMsg.header.identityKey && encMsg.header.ephemeralKey);

  // If this is an X3DH initial message, set up the receiver session if needed
  if (isX3DHInitial) {
    const sessionExists = await hasSession(conversationId);
    if (!sessionExists) {
      await setupReceiverX3DH(conversationId, encMsg);
    }
  }

  try {
    return await ratchetDecrypt(conversationId, encMsg);
  } catch (err) {
    // If decryption failed and this has X3DH headers, the session may be stale —
    // delete it and re-derive from the X3DH handshake
    if (isX3DHInitial) {
      await deleteSession(conversationId);
      await setupReceiverX3DH(conversationId, encMsg);
      return ratchetDecrypt(conversationId, encMsg);
    }
    throw err;
  }
}

interface Participant {
  user: { id: string; username: string; displayName: string };
}

interface ConversationData {
  id: string;
  participants: Participant[];
}

export default function ConversationPage() {
  const { user: session_user, logout } = useAuth();
  const params = useParams();
  const conversationId = params?.conversationId as string;
  const {
    sendMessage,
    joinConversation,
    onMessage,
    onHPOPacket,
    isConnected,
    onlineUsers,
    sendTyping,
    sendStopTyping,
  } = useSocket();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [e2eeReady, setE2eeReady] = useState(false);
  const sessionInitRef = useRef(false);
  const [hpoMetrics, setHpoMetrics] = useState({
    coverReceived: 0,
    realReceived: 0,
  });
  const [hpoEnabled, setHpoEnabled] = useState(true);
  const [isTyping, setIsTyping] = useState(false);

  const currentUserId = session_user?.id || "";

  // Fetch conversation info
  useEffect(() => {
    async function fetchConversation() {
      try {
        const res = await authFetch("/api/conversations");
        const data = await res.json();
        const conv = data.conversations?.find(
          (c: ConversationData) => c.id === conversationId
        );
        setConversation(conv || null);
      } catch (error) {
        console.error("Failed to fetch conversation:", error);
      }
    }
    fetchConversation();
  }, [conversationId]);

  // Initialize E2EE session
  useEffect(() => {
    if (!conversation || !session_user?.id || sessionInitRef.current) return;

    // Bind crypto store to current user so each user gets their own IndexedDB
    initCryptoStore(session_user!.id);

    async function initE2EE() {
      try {
        const sessionExists = await hasSession(conversationId);
        if (sessionExists) {
          setE2eeReady(true);
          return;
        }

        // Check if we have local keys
        const identity = await getIdentityKey();
        if (!identity) {
          console.warn("[E2EE] No local identity keys. Please re-register.");
          setE2eeReady(false);
          return;
        }

        setE2eeReady(true);
      } catch (error) {
        console.error("[E2EE] Session init failed:", error);
        setE2eeReady(false);
      }
    }

    sessionInitRef.current = true;
    initE2EE();
  }, [conversation, session_user?.id, conversationId]);

  // Fetch existing messages and decrypt them
  useEffect(() => {
    async function fetchMessages() {
      setLoading(true);
      try {
        const res = await authFetch(
          `/api/conversations/${conversationId}/messages`
        );
        const data = await res.json();
        const displayMessages: DisplayMessage[] = [];

        for (const msg of data.messages || []) {
          let content = msg.ciphertext;
          let encrypted = false;

          // Try to decrypt if ratchet header exists
          if (msg.ratchetHeader && msg.ratchetHeader !== "") {
            // Check plaintext cache first (ratchet keys advance after decrypt,
            // so re-decrypting the same message would fail)
            const cached = await getCachedPlaintext(msg.id);
            if (cached !== undefined) {
              content = cached;
              encrypted = true;
            } else {
              try {
                const encMsg: EncryptedMessage = JSON.parse(msg.ciphertext);
                content = await decryptMessage(conversationId, encMsg);
                encrypted = true;
                await setCachedPlaintext(msg.id, content);
              } catch (err) {
                console.error("[E2EE] Failed to decrypt stored message:", err);
                content = "[Encrypted message - decryption failed]";
              }
            }
          }

          displayMessages.push({
            id: msg.id,
            content,
            senderId: msg.senderId,
            timestamp: new Date(msg.timestamp).getTime(),
            encrypted,
          });
        }

        setMessages(displayMessages);
      } catch (error) {
        console.error("Failed to fetch messages:", error);
      } finally {
        setLoading(false);
      }
    }
    if (e2eeReady) {
      fetchMessages();
    }
  }, [conversationId, e2eeReady]);

  // Join conversation room
  useEffect(() => {
    if (isConnected && conversationId) {
      joinConversation(conversationId);
    }
  }, [isConnected, conversationId, joinConversation]);

  // Listen for incoming messages (direct mode)
  useEffect(() => {
    const cleanup = onMessage(async (data: EncryptedPacket) => {
      if (data.conversationId !== conversationId) return;

      let content = data.ciphertext;
      let encrypted = false;

      // Try to decrypt
      if (data.ratchetHeader && data.ratchetHeader !== "") {
        try {
          const encMsg: EncryptedMessage = JSON.parse(data.ciphertext);
          content = await decryptMessage(conversationId, encMsg);
          encrypted = true;
          if (data.id) await setCachedPlaintext(data.id, content);
        } catch (err) {
          console.error("[E2EE] Decryption failed:", err);
          content = "[Encrypted message - decryption failed]";
        }
      }

      const newMsg: DisplayMessage = {
        id: data.id,
        content,
        senderId: data.senderId,
        timestamp: data.timestamp,
        encrypted,
      };
      setMessages((prev) => [...prev, newMsg]);
    });
    return cleanup;
  }, [onMessage, conversationId]);

  // Listen for HPO packets
  useEffect(() => {
    const cleanup = onHPOPacket(async (wirePacket: HPOWirePacket) => {
      try {
        const buffer = Uint8Array.from(atob(wirePacket.data), (c) =>
          c.charCodeAt(0)
        );

        const typeByte = buffer[0];
        if (typeByte === 0x00) {
          // Cover packet - silently discard
          setHpoMetrics((prev) => ({
            ...prev,
            coverReceived: prev.coverReceived + 1,
          }));
          return;
        }

        if (typeByte === 0x01) {
          setHpoMetrics((prev) => ({
            ...prev,
            realReceived: prev.realReceived + 1,
          }));

          // Real packet - extract padded payload
          const view = new DataView(buffer.buffer, buffer.byteOffset);
          const payloadLength = view.getUint32(1, false);
          const payloadBytes = buffer.slice(5, 5 + payloadLength);
          const jsonStr = new TextDecoder().decode(payloadBytes);
          const packet: EncryptedPacket = JSON.parse(jsonStr);

          if (packet.conversationId !== conversationId) return;

          let content = packet.ciphertext;
          let encrypted = false;

          if (packet.ratchetHeader && packet.ratchetHeader !== "") {
            try {
              const encMsg: EncryptedMessage = JSON.parse(packet.ciphertext);
              content = await decryptMessage(conversationId, encMsg);
              encrypted = true;
              if (packet.id) await setCachedPlaintext(packet.id, content);
            } catch {
              content = "[Encrypted message - decryption failed]";
            }
          }

          const newMsg: DisplayMessage = {
            id: packet.id,
            content,
            senderId: packet.senderId,
            timestamp: packet.timestamp,
            encrypted,
          };
          setMessages((prev) => [...prev, newMsg]);
        }
      } catch (error) {
        console.error("[HPO] Failed to parse packet:", error);
      }
    });
    return cleanup;
  }, [onHPOPacket, conversationId]);

  // Typing indicators are now handled server-side via WebSocket broadcast.
  // The current WebSocket provider doesn't expose raw typing events yet,
  // so typing indicators are simplified for now.

  const handleToggleHPO = useCallback(async (enabled: boolean) => {
    try {
      const res = await authFetch("/api/hpo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setHpoEnabled(enabled);
      }
    } catch (error) {
      console.error("[HPO] Toggle failed:", error);
    }
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      if (!session_user?.id || !conversation) return;

      const recipient = conversation.participants.find(
        (p) => p.user.id !== session_user!.id
      )?.user;

      if (!recipient) return;

      let ciphertext = content;
      let ratchetHeader = "";
      let encrypted = false;

      try {
        const sessionExists = await hasSession(conversationId);

        if (!sessionExists) {
          // First message - perform X3DH handshake
          const bundle = await fetchKeyBundle(recipient.id);
          if (bundle) {
            const x3dhResult = await x3dhInitiate(bundle);
            const recipientSignedPreKey = fromHex(bundle.signedPreKey);
            await initSenderSession(
              conversationId,
              x3dhResult.sharedSecret,
              recipientSignedPreKey
            );

            // Encrypt with ratchet
            const encMsg = await ratchetEncrypt(conversationId, content);

            // Add X3DH info to header for recipient
            const identity = await getIdentityKey();
            if (identity) {
              encMsg.header.identityKey = identity.publicKey;
              encMsg.header.ephemeralKey = x3dhResult.ephemeralPublic;
              encMsg.header.usedOneTimePreKeyId =
                x3dhResult.usedOneTimePreKeyId;
            }

            ciphertext = JSON.stringify(encMsg);
            ratchetHeader = "e2ee";
            encrypted = true;
            setE2eeReady(true);
          }
        } else {
          // Existing session - encrypt with ratchet
          const encMsg = await ratchetEncrypt(conversationId, content);
          ciphertext = JSON.stringify(encMsg);
          ratchetHeader = "e2ee";
          encrypted = true;
        }
      } catch (error) {
        console.error("[E2EE] Encryption failed, sending plaintext:", error);
      }

      const packet: EncryptedPacket = {
        id: "",
        conversationId,
        senderId: session_user!.id,
        recipientId: recipient.id,
        ciphertext,
        ratchetHeader,
        timestamp: Date.now(),
      };

      const result = await sendMessage(packet);

      if (result.success) {
        const msgId = result.messageId || crypto.randomUUID();
        // Cache plaintext so sender can see their own messages on page reload
        // (ratchetDecrypt only works with the receive chain, not the send chain)
        if (encrypted) {
          await setCachedPlaintext(msgId, content);
        }
        const newMsg: DisplayMessage = {
          id: msgId,
          content,
          senderId: session_user!.id,
          timestamp: Date.now(),
          encrypted,
        };
        setMessages((prev) => [...prev, newMsg]);
      }
    },
    [session_user, conversation, conversationId, sendMessage]
  );

  const otherUser = conversation?.participants.find(
    (p) => p.user.id !== currentUserId
  )?.user;

  const isOtherOnline = otherUser ? onlineUsers.has(otherUser.id) : false;

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-80 border-r flex flex-col bg-background">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-lg">HPO Chat</h1>
          </div>
          <div className="flex items-center gap-1">
            <NewChatDialog />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Separator />
        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium">
              {session_user?.displayName || "User"}
            </span>
          </p>
        </div>
        <Separator />
        <ConversationList />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Chat header */}
        <div className="border-b p-4 flex items-center justify-between bg-background">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-xs">
                {otherUser?.displayName
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-medium text-sm">
                {otherUser?.displayName || "Loading..."}
              </h2>
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isOtherOnline ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
                <span className="text-xs text-muted-foreground">
                  {isOtherOnline ? "Online" : "Offline"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs gap-1 ${
                e2eeReady ? "border-green-500 text-green-600" : ""
              }`}
            >
              <Lock className="h-3 w-3" />
              {e2eeReady ? "E2EE Active" : "E2EE"}
            </Badge>
          </div>
        </div>

        {/* Messages */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading messages...
          </div>
        ) : (
          <MessageList messages={messages} currentUserId={currentUserId} />
        )}

        {/* HPO Status */}
        <HPOStatusPanel
          coverReceived={hpoMetrics.coverReceived}
          realReceived={hpoMetrics.realReceived}
          hpoEnabled={hpoEnabled}
          onToggleHPO={handleToggleHPO}
        />

        {/* Typing indicator */}
        {isTyping && (
          <div className="px-4 py-1 text-xs text-muted-foreground animate-pulse">
            {otherUser?.displayName || "User"} is typing...
          </div>
        )}

        {/* Input */}
        <MessageInput
          onSend={handleSend}
          onTyping={() => sendTyping(conversationId)}
          onStopTyping={() => sendStopTyping(conversationId)}
          disabled={!isConnected}
        />
      </div>
    </div>
  );
}
