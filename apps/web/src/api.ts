// The floor's API client. Same-origin /api — vite proxies it to the service in dev and preview,
// so the built app never hard-codes a host. The session token is held in memory and passed as a
// bearer (brief §4: cookie/persistence is a named later decision).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly body: unknown,
  ) {
    super(code);
  }
}

const BASE = "/api/v1";

async function req(path: string, init: RequestInit, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body as { error?: string })?.error ?? `http_${res.status}`;
    throw new ApiError(res.status, code, body);
  }
  return body;
}

export interface Card {
  submission_id: string;
  title: string;
  kind: "queue" | "volume";
  word_count: number;
  rooms: string[];
  hands: string[];
  provenance: { sessions: number; span_weeks: number; composed_in_wrizo: boolean };
  created_at: string;
  readers_so_far: number;
}

export interface Hold {
  submission_id: string;
  claimed_at: string;
  expires_at: string;
}

export interface Piece {
  card: Card;
  text: string;
  board_bundle: { format: string; cards: { title: string; body: string }[] } | null;
  provenance: Card["provenance"];
}

export interface Reading {
  reading_id: string;
  reader_name: string;
  body: string;
  word_count: number;
  filed_at: string;
  own: boolean;
  ratings?: { useful: number; somewhat: number };
}

export type Seal = { sealed: true; count: number } | { sealed: false; readings: Reading[] };

export interface LedgerEntry {
  delta: number;
  reason: string;
  reading_id: string | null;
  submission_id: string | null;
  created_at: string;
}

export const api = {
  register: (email: string, password: string) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }) as Promise<{
      account_id: string;
      token: string;
    }>,
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }) as Promise<{
      account_id: string;
      token: string;
    }>,
  becomeWriter: (token: string) =>
    req("/auth/writer", { method: "POST", body: "{}" }, token) as Promise<{ pseudonym: string }>,
  me: (token: string) =>
    req("/auth/me", { method: "GET" }, token) as Promise<{
      account_id: string;
      roles: string[];
      pseudonym: string | null;
    }>,
  queue: (token: string, query: string) =>
    req(`/workshop/queue${query}`, { method: "GET" }, token) as Promise<Card[]>,
  volumes: (token: string) =>
    req("/workshop/volumes", { method: "GET" }, token) as Promise<Card[]>,
  deal: (token: string) =>
    req("/workshop/queue/deal", { method: "GET" }, token) as Promise<Card>,
  claim: (token: string, submissionId: string) =>
    req("/workshop/claims", { method: "POST", body: JSON.stringify({ submission_id: submissionId }) }, token) as Promise<Hold>,
  release: (token: string, submissionId: string) =>
    req(`/workshop/claims/${submissionId}/release`, { method: "POST", body: "{}" }, token) as Promise<{ released: boolean }>,
  mine: (token: string) =>
    req("/workshop/claims/mine", { method: "GET" }, token) as Promise<Hold[]>,
  piece: (token: string, id: string) =>
    req(`/workshop/pieces/${id}`, { method: "GET" }, token) as Promise<Piece>,
  readings: (token: string, id: string) =>
    req(`/workshop/pieces/${id}/readings`, { method: "GET" }, token) as Promise<Seal>,
  fileReading: (token: string, id: string, body: string) =>
    req(`/workshop/pieces/${id}/readings`, { method: "POST", body: JSON.stringify({ body }) }, token) as Promise<{
      reading: Reading;
      balance: number;
    }>,
  rate: (token: string, readingId: string, value: "useful" | "somewhat") =>
    req(`/workshop/readings/${readingId}/rate`, { method: "POST", body: JSON.stringify({ value }) }, token) as Promise<{
      rated: boolean;
      rater_kind: "author" | "peer";
    }>,
  credits: (token: string) =>
    req("/workshop/credits", { method: "GET" }, token) as Promise<{ balance: number; recent: LedgerEntry[] }>,
};
