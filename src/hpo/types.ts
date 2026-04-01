/**
 * HPO (Hybrid Practical Obfuscation) Packet Types
 *
 * Defines the wire format for HPO packets.
 * All packets are padded to standard block sizes and encrypted
 * so cover traffic is indistinguishable from real messages.
 */

export interface HPOPacketEnvelope {
  type: "real" | "cover"; // INSIDE encrypted payload - not visible externally
  payload: string; // base64 encoded content
  timestamp: number;
}

export interface HPOMetrics {
  totalPacketsSent: number;
  coverPacketsSent: number;
  realPacketsSent: number;
  coverRatio: number;
  averageLatencyMs: number;
  crtIntervalMs: number;
  hpoEnabled: boolean;
  currentBlockSize: number;
}
