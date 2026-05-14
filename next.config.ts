import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// Collect every non-loopback IPv4 address on this machine so Next.js dev
// server accepts requests from any local network IP without CORS errors.
function localNetworkOrigins(): string[] {
  const origins: string[] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        origins.push(iface.address);
      }
    }
  }
  return origins;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: localNetworkOrigins(),
};

export default nextConfig;
