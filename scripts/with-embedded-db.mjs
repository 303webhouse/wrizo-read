import { spawnSync } from "node:child_process";
import { migrate, repoRoot, startEmbeddedDb } from "./embedded-db.mjs";

// Run any command against a fresh, migrated, embedded Postgres. Lets the DB-backed suites run
// with no external database:  node scripts/with-embedded-db.mjs pnpm --filter @wrizo/api test
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: with-embedded-db <command> [args...]");
  process.exit(2);
}

const db = await startEmbeddedDb();
let code = 1;
try {
  migrate(db.databaseUrl);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: db.databaseUrl },
  });
  code = res.status ?? 1;
} finally {
  await db.stop();
}
process.exit(code);
