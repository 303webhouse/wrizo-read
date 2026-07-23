import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A real, zero-prerequisite Postgres for local dev, the one-command floor, and DB tests on a
// machine without a database. Downloads/runs a genuine Postgres binary (not an emulation), so the
// schema — citext, partial unique indexes, COMMENT — behaves exactly as in production.
const PORT = 54329;
const DB = "wrizo_read";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function startEmbeddedDb() {
  // Non-persistent cluster: clear any leftover data dir (e.g. from a killed run) so initdb runs.
  const databaseDir = resolve(repoRoot, ".localdb");
  rmSync(databaseDir, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB);
  return {
    databaseUrl: `postgres://postgres:postgres@127.0.0.1:${PORT}/${DB}`,
    stop: () => pg.stop(),
  };
}

export function migrate(databaseUrl) {
  const res = spawnSync("pnpm", ["--filter", "@wrizo/api", "migrate:up"], {
    stdio: "inherit",
    shell: true,
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (res.status !== 0) throw new Error("migrations failed");
}
