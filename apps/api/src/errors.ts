// Typed application errors. Every failure the client should see carries a stable code and an
// HTTP status; the error handler in server.ts maps them uniformly. Never leak internals.
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const unauthorized = (detail?: Record<string, unknown>) =>
  new ApiError("unauthorized", 401, detail);
export const forbidden = (detail?: Record<string, unknown>) =>
  new ApiError("forbidden", 403, detail);
