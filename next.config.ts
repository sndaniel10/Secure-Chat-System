import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy API requests to FastAPI backend
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
      // Proxy WebSocket connection to FastAPI backend
      {
        source: "/ws",
        destination: "http://localhost:8000/ws",
      },
    ];
  },
};

export default nextConfig;
