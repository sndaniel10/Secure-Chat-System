// HPO Configuration Constants
export const CRT_INTERVAL_MS = 500; // Constant Rate Transmission interval (ms)
export const MAX_QUEUE_DEPTH = 50; // Max queued messages before dropping oldest
export const COVER_PACKET_SIZE = 1024; // Cover packet block size (bytes)
export const HPO_ENABLED = true; // Toggle HPO on/off for evaluation

// Packet Padding Block Sizes
export const BLOCK_SIZES = [1024, 2048, 4096] as const; // 1KB, 2KB, 4KB
export type BlockSize = (typeof BLOCK_SIZES)[number];

// Socket.IO Configuration
export const SOCKET_PATH = "/api/socketio";
