import pg from "pg";

// A single pool per process. Migrations run out-of-band via node-pg-migrate (see package.json).
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}
