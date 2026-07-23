import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config";
import { createPool } from "./db";
import { ApiError } from "./errors";
import { createStorage } from "./storage";
import { registerAuthContext } from "./auth/plugin";
import { registerAuthRoutes } from "./auth/routes";
import { registerHealth } from "./routes/health";
import { registerSubmissions } from "./routes/submissions";
import { registerQueueRoutes } from "./queue/routes";
import type { IntakeDeps } from "./intake/pipeline";

export type BuildDeps = IntakeDeps;

export function build(deps: BuildDeps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.status).send({ error: err.code, ...(err.detail ?? {}) });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "internal_error" });
  });

  registerAuthContext(app, deps.pool);
  registerHealth(app);
  registerAuthRoutes(app, deps.pool);
  registerSubmissions(app, deps);
  registerQueueRoutes(app, deps);
  return app;
}

async function main(): Promise<void> {
  const pool = createPool(config.databaseUrl);
  const storage = createStorage(config.s3);
  const app = build({ pool, storage });
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Boot only when executed directly (tsx src/server.ts); stay quiet when imported by tests.
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (invokedDirectly) void main();
