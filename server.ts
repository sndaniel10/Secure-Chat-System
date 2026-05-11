import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { handleConnection } from "./src/lib/ws/handler";
import { startCrt, stopCrt } from "./src/lib/hpo/crt-engine";

const dev = process.env.NODE_ENV !== "production";
const desiredPort = Number(process.env.PORT ?? 3000);
// Dev defaults to localhost (matches `next dev`); prod listens on 0.0.0.0 for Cloud Run.
const hostname =
  process.env.HOSTNAME ?? (dev ? "localhost" : "0.0.0.0");

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
    if (!req.url?.startsWith("/ws")) {
      socket.destroy();
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token") ?? "";

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, token).catch((err) => {
        console.error("[WS] Upgrade handler error:", err);
        ws.close(1011, "Internal error");
      });
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`  ▲ Next.js  http://${hostname}:${port}`);
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
