import { randomBytes } from "crypto";
import { COVER_PACKET_SIZE } from "./config";
import { HPOWirePacket } from "../src/socket/events";

let coverSequence = 0;

/**
 * Generate an encrypted cover packet that is indistinguishable
 * from a real packet to a network observer.
 * Cover packets are random bytes padded to the standard block size.
 */
export function generateCoverPacket(): HPOWirePacket {
  // Generate random bytes that look identical to encrypted data
  const coverData = randomBytes(COVER_PACKET_SIZE);

  // Prepend a type marker inside the "encrypted" envelope
  // Byte 0: 0x00 = cover, 0x01 = real
  // This marker is part of the data blob, not a separate header
  coverData[0] = 0x00; // cover packet marker

  return {
    data: coverData.toString("base64"),
    size: COVER_PACKET_SIZE,
    seq: coverSequence++,
  };
}

/**
 * Wrap a real message packet into HPO wire format with padding.
 */
export function wrapRealPacket(
  jsonPayload: string,
  targetSize: number
): HPOWirePacket {
  const payloadBytes = Buffer.from(jsonPayload, "utf-8");

  // Create padded buffer
  const padded = Buffer.alloc(targetSize);

  // Byte 0: real packet marker
  padded[0] = 0x01;

  // Bytes 1-4: actual payload length (big-endian uint32)
  padded.writeUInt32BE(payloadBytes.length, 1);

  // Bytes 5+: actual payload
  payloadBytes.copy(padded, 5);

  // Fill remaining with random bytes (not zeros - indistinguishable from ciphertext)
  if (5 + payloadBytes.length < targetSize) {
    const randomPadding = randomBytes(targetSize - 5 - payloadBytes.length);
    randomPadding.copy(padded, 5 + payloadBytes.length);
  }

  return {
    data: padded.toString("base64"),
    size: targetSize,
    seq: coverSequence++,
  };
}

/**
 * Determine the appropriate block size for a given payload.
 */
export function selectBlockSize(payloadLength: number): number {
  const totalNeeded = payloadLength + 5; // 1 byte type + 4 bytes length
  if (totalNeeded <= 1024) return 1024;
  if (totalNeeded <= 2048) return 2048;
  return 4096;
}
