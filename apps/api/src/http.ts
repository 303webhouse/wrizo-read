import { ApiError } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Riding note #1 (AX2 review §4): a non-UUID path param must surface as a typed 404, never a raw
// Postgres 22P02 (invalid_text_representation) 500. Parameterized queries mean no injection risk —
// this is purely robustness.
export function requireUuidParam(value: unknown): string {
  if (typeof value === "string" && UUID.test(value)) return value;
  throw new ApiError("not_found", 404);
}
