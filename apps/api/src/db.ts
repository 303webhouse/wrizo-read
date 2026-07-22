import pg from "pg";
import { config } from "./config";

// Single pool for the service. Migrations run out-of-band via node-pg-migrate (see package.json).
export const pool = new pg.Pool({ connectionString: config.databaseUrl });
