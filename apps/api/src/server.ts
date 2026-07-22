import Fastify from "fastify";
import { config } from "./config";
import { registerHealth } from "./routes/health";
import { registerSubmissions } from "./routes/submissions";

export function build() {
  const app = Fastify({ logger: true });
  registerHealth(app);
  registerSubmissions(app);
  return app;
}

async function main(): Promise<void> {
  const app = build();
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
