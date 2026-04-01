// Server-side HPO configuration
// These mirror src/lib/constants.ts but are available without Next.js module resolution
export const CRT_INTERVAL_MS = 500;
export const MAX_QUEUE_DEPTH = 50;
export const COVER_PACKET_SIZE = 1024;
export const HPO_ENABLED = true;
export const SOCKET_PATH = "/api/socketio";
export const BLOCK_SIZES = [1024, 2048, 4096] as const;
