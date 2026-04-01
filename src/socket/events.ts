export interface EncryptedPacket {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  ciphertext: string; // base64 encoded
  ratchetHeader: string; // base64 encoded
  timestamp: number;
  // HPO fields
  padded?: boolean;
  blockSize?: number;
}

export interface ServerToClientEvents {
  "message:receive": (data: EncryptedPacket) => void;
  "message:delivered": (data: { messageId: string }) => void;
  "user:online": (data: { userId: string }) => void;
  "user:offline": (data: { userId: string }) => void;
  "user:typing": (data: { userId: string; conversationId: string }) => void;
  "user:stopTyping": (data: { userId: string; conversationId: string }) => void;
  "hpo:packet": (data: HPOWirePacket) => void;
  "hpo:status": (data: HPOStatus) => void;
}

export interface ClientToServerEvents {
  "message:send": (
    data: EncryptedPacket,
    callback: (ack: { success: boolean; messageId?: string }) => void
  ) => void;
  "conversation:join": (conversationId: string) => void;
  "user:authenticate": (
    userId: string,
    callback: (ack: { success: boolean }) => void
  ) => void;
  "user:typing": (conversationId: string) => void;
  "user:stopTyping": (conversationId: string) => void;
}

export interface HPOWirePacket {
  data: string; // base64 encoded encrypted blob (real or cover)
  size: number; // padded size in bytes
  seq: number; // sequence number for CRT
}

export interface HPOStatus {
  crtInterval: number;
  coverPacketsSent: number;
  realPacketsSent: number;
  queueDepth: number;
  hpoEnabled: boolean;
}
