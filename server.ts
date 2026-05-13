import "dotenv/config";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import next from "next";
import { WebSocketServer } from "ws";
import { handleConnection } from "./src/lib/ws/handler";
import { startCrt, stopCrt } from "./src/lib/hpo/crt-engine";

const dev = process.env.NODE_ENV !== "production";
const desiredPort = Number(process.env.PORT ?? 3000);
// Bind on all interfaces so the network URL works (same as `next dev`).
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

async function findAvailablePort(start: number, host: string): Promise<number> {
  for (let p = start; p < start + 20; p += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once("error", (err: NodeJS.ErrnoException) => {
        probe.close();
        resolve(err.code !== "EADDRINUSE");
      });
      probe.once("listening", () => probe.close(() => resolve(true)));
      probe.listen(p, host);
    });
    if (free) return p;
  }
  throw new Error(`No available port in range ${start}-${start + 19}`);
}

async function main() {
  // In dev, mirror `next dev`'s behavior: fall back to next free port if busy.
  const port = dev ? await findAvailablePort(desiredPort, hostname) : desiredPort;
  if (port !== desiredPort) {
    console.log(` ⚠ Port ${desiredPort} in use — using ${port} instead`);
  }

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextUpgrade = (app as any).getUpgradeHandler?.();

  const httpServer = createServer((req, res) => {
    if (req.url === "/ws" || req.url?.startsWith("/ws?")) {
      // WS upgrades are handled below; reject HTTP requests on /ws
      res.writeHead(426, { "Content-Type": "text/plain" });
      res.end("Upgrade Required");
      return;
    }
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws")) {
      // Our chat WebSocket
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get("token") ?? "";
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleConnection(ws, token).catch((err) => {
          console.error("[WS] Upgrade handler error:", err);
          ws.close(1011, "Internal error");
        });
      });
    } else if (nextUpgrade) {
      // Next.js HMR and other internal WebSockets
      nextUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, hostname, () => {
    const nets = networkInterfaces();
    const networkIp = Object.values(nets)
      .flat()
      .find((n) => n?.family === "IPv4" && !n.internal)?.address;

    console.log(`\n  ▲ Next.js\n`);
    console.log(`  - Local:    http://localhost:${port}`);
    if (networkIp) console.log(`  - Network:  http://${networkIp}:${port}`);
    console.log();
    startCrt();
  });

  const shutdown = () => {
    console.log("\n> Shutting down");
    stopCrt();
    wss.close();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
