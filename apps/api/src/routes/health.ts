import type { FastifyInstance } from "fastify";

export function registerHealth(app: FastifyInstance): void {
  app.get("/health", async () => ({ status: "ok" }));
}
