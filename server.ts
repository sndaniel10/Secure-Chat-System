import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setupSocketHandlers } from "./server/socket-handlers";
import { startCRT } from "./server/crt-engine";
import { SOCKET_PATH } from "./server/config";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    path: SOCKET_PATH,
    cors: {
      origin: dev ? "*" : false,
    },
    transports: ["websocket", "polling"],
  });

  // Set up Socket.IO event handlers
  setupSocketHandlers(io);

  // Start the Constant Rate Transmission engine
  startCRT(io);

  httpServer.listen(port, () => {
    console.log(
      `> HPO Encrypted Chat Server ready on http://${hostname}:${port}`
    );
    console.log(`> Socket.IO path: ${SOCKET_PATH}`);
    console.log(`> Environment: ${dev ? "development" : "production"}`);
  });
});
