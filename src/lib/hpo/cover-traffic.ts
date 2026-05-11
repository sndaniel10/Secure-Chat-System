import { randomBytes } from "node:crypto";
import { COVER_PACKET_SIZE, BLOCK_SIZES } from "./config";

let coverSequence = 0;

export interface WirePacket {
  data: string;
  size: number;
  seq: number;
}

export function generateCoverPacket(): WirePacket {
  const buf = randomBytes(COVER_PACKET_SIZE);
  // Byte 0: 0x00 = cover packet marker
  buf[0] = 0x00;

  coverSequence += 1;
  return {
    data: buf.toString("base64"),
    size: COVER_PACKET_SIZE,
    seq: coverSequence,
  };
}

export function wrapRealPacket(jsonPayload: string, targetSize: number): WirePacket {
  const payloadBytes = Buffer.from(jsonPayload, "utf8");
  const padded = Buffer.alloc(targetSize);

  // Byte 0: 0x01 = real packet marker
  padded[0] = 0x01;
  // Bytes 1-4: actual payload length (big-endian uint32)
  padded.writeUInt32BE(payloadBytes.length, 1);
  // Bytes 5+: actual payload
  payloadBytes.copy(padded, 5);

  // Fill remaining with random bytes
  const remaining = targetSize - 5 - payloadBytes.length;
  if (remaining > 0) {
    randomBytes(remaining).copy(padded, 5 + payloadBytes.length);
  }

  coverSequence += 1;
  return {
    data: padded.toString("base64"),
    size: targetSize,
    seq: coverSequence,
  };
}

export function selectBlockSize(payloadLength: number): number {
  const totalNeeded = payloadLength + 5;
  for (const size of BLOCK_SIZES) {
    if (totalNeeded <= size) return size;
  }
  return BLOCK_SIZES[BLOCK_SIZES.length - 1];
}
