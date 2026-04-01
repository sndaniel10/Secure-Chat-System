"use client";

/**
 * Packet Padding for Size Obfuscation
 *
 * Pads all transmitted payloads to standardized block sizes (1KB, 2KB, 4KB)
 * to prevent traffic analysis based on message length.
 *
 * Design:
 * - First 4 bytes: actual payload length (big-endian uint32)
 * - Remaining space: random bytes (indistinguishable from ciphertext)
 */

import { BLOCK_SIZES } from "@/lib/constants";

/**
 * Pad a payload to the nearest block size.
 * Returns a Uint8Array of exactly 1024, 2048, or 4096 bytes.
 */
export function padPayload(data: Uint8Array): Uint8Array {
  const totalNeeded = data.length + 4; // 4 bytes for length prefix

  // Select smallest block size that fits
  const targetSize =
    BLOCK_SIZES.find((size) => size >= totalNeeded) ||
    BLOCK_SIZES[BLOCK_SIZES.length - 1];

  const padded = new Uint8Array(targetSize);

  // First 4 bytes: actual data length (big-endian uint32)
  new DataView(padded.buffer).setUint32(0, data.length, false);

  // Copy actual data
  padded.set(data, 4);

  // Fill remaining with cryptographically random bytes
  if (4 + data.length < targetSize) {
    const randomPadding = new Uint8Array(targetSize - 4 - data.length);
    crypto.getRandomValues(randomPadding);
    padded.set(randomPadding, 4 + data.length);
  }

  return padded;
}

/**
 * Remove padding and extract the original payload.
 */
export function unpadPayload(padded: Uint8Array): Uint8Array {
  const actualLength = new DataView(
    padded.buffer,
    padded.byteOffset
  ).getUint32(0, false);

  if (actualLength > padded.length - 4) {
    throw new Error("Invalid padded payload: length exceeds buffer");
  }

  return padded.slice(4, 4 + actualLength);
}

/**
 * Get the block size that will be used for a given data length.
 */
export function getBlockSize(dataLength: number): number {
  const totalNeeded = dataLength + 4;
  return (
    BLOCK_SIZES.find((size) => size >= totalNeeded) ||
    BLOCK_SIZES[BLOCK_SIZES.length - 1]
  );
}
