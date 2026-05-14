import "dotenv/config";
import { createServer as createHttp } from "node:http";
import { createServer as createHttps } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
      const probe = createHttp();
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

  const certFile = join(process.cwd(), "certs", "cert.pem");
  const keyFile  = join(process.cwd(), "certs", "key.pem");
  const useHttps = existsSync(certFile) && existsSync(keyFile);

  const handler = (req: Parameters<typeof handle>[0], res: Parameters<typeof handle>[1]) => {
    if (req.url === "/ws" || req.url?.startsWith("/ws?")) {
      res.writeHead(426, { "Content-Type": "text/plain" });
      res.end("Upgrade Required");
      return;
    }
    handle(req, res);
  };

  const httpServer = useHttps
    ? createHttps({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, handler)
    : createHttp(handler);

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

    const proto = useHttps ? "https" : "http";
    console.log(`\n  ▲ Next.js${useHttps ? " (HTTPS)" : ""}\n`);
    console.log(`  - Local:    ${proto}://localhost:${port}`);
    if (networkIp) console.log(`  - Network:  ${proto}://${networkIp}:${port}`);
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
