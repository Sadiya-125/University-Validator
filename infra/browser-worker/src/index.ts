import Fastify from "fastify";
import { BrowserPool } from "./pool.js";
import { RenderRequest, RenderResponse, HealthResponse } from "./types.js";

const app = Fastify({
  logger: true,
});

const pool = new BrowserPool();

// Health check endpoint (no auth required)
app.get<{
  Reply: HealthResponse;
}>("/health", async () => {
  return {
    status: "ok",
    poolSize: pool.poolSize,
    busy: pool.activeBrowsers,
    queued: pool.queuedRequests,
    rendersSinceRecycle: pool.rendersSinceRecycle,
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
});

// Bearer token auth
app.addHook("onRequest", async (request: any, reply: any) => {
  if (request.url === "/health") {
    return; // Skip auth for health endpoint
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.code(403).send({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== process.env.AUTH_TOKEN) {
    reply.code(403).send({ error: "Unauthorized" });
    return;
  }
});

// Render endpoint
app.post<{
  Body: RenderRequest;
  Reply: RenderResponse;
}>("/render", async (request: any) => {
  if (!request.body.url) {
    return {
      status: "error",
      error: "Missing 'url' parameter",
    };
  }

  if (pool.queuedRequests >= (process.env.MAX_QUEUE_DEPTH ? parseInt(process.env.MAX_QUEUE_DEPTH) : 20)) {
    return {
      status: "error",
      error: "Queue full",
      statusCode: 503,
    };
  }

  try {
    const result = await pool.render(request.body);
    return result;
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Start server
const start = async () => {
  try {
    await app.listen({ port: parseInt(process.env.PORT || "3000"), host: "0.0.0.0" });
    console.log("Browser worker listening on port 3000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await pool.close();
  await app.close();
  process.exit(0);
});

start();
