export const CRT_INTERVAL_MS = 500;
export const MAX_QUEUE_DEPTH = 50;
export const COVER_PACKET_SIZE = 1024;
export const BLOCK_SIZES = [1024, 2048, 4096] as const;

declare global {
  // eslint-disable-next-line no-var
  var _hpoEnabled: boolean | undefined;
}

if (global._hpoEnabled === undefined) {
  global._hpoEnabled = true;
}

export function isHpoEnabled(): boolean {
  return global._hpoEnabled ?? true;
}

export function setHpoEnabled(value: boolean): void {
  global._hpoEnabled = value;
}
