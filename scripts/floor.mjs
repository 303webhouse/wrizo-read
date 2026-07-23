import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { migrate, repoRoot, startEmbeddedDb } from "./embedded-db.mjs";

// The one-command floor (brief §7.2). Brings up an embedded Postgres (unless DATABASE_URL is
// set), applies the schema, boots the API, seeds the floor through the real publish API, and
// serves the web — all from `pnpm floor`, no prerequisites beyond Node + pnpm.
const API_PORT = 8080;
const WEB_PORT = 5173;
const API = `http://127.0.0.1:${API_PORT}`;

const children = [];
function run(cmd, args, env) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
    cwd: repoRoot,
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
}

async function waitForHealth(url, ms = 40000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error("the API did not become healthy in time");
}

let db = null;
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      // best effort
    }
  }
  if (db) {
    try {
      await db.stop();
    } catch {
      // best effort
    }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("floor: no DATABASE_URL — starting an embedded Postgres…");
    db = await startEmbeddedDb();
    databaseUrl = db.databaseUrl;
  }

  console.log("floor: applying migrations…");
  migrate(databaseUrl);

  console.log("floor: starting the API…");
  run("pnpm", ["--filter", "@wrizo/api", "start"], {
    DATABASE_URL: databaseUrl,
    ALLOW_MEMORY_STORAGE: "true",
    HOST: "127.0.0.1",
    PORT: String(API_PORT),
  });
  await waitForHealth(`${API}/health`);

  console.log("floor: seeding the floor through the publish API…");
  const seed = run("pnpm", ["exec", "tsx", "tools/seed-floor.ts"], { API_URL: API });
  await new Promise((resolve) => seed.on("exit", resolve));

  console.log("floor: starting the web…");
  run("pnpm", ["--filter", "@wrizo/web", "dev", "--", "--port", String(WEB_PORT), "--strictPort"], {
    API_URL: API,
  });

  console.log(`\n  ✦ The floor is up. Open  http://localhost:${WEB_PORT}\n    (Ctrl+C stops everything.)\n`);
}

main().catch(async (err) => {
  console.error(err);
  await shutdown();
});
