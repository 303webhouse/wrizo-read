import { useEffect, useState } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;

export function waitingLabel(createdAt: string, now: number): string {
  const days = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / DAY_MS));
  if (days === 0) return "Waiting since today";
  if (days === 1) return "Waiting 1 day";
  return `Waiting ${days} days`;
}

export function readersLabel(n: number): string {
  if (n === 0) return "no readers yet";
  if (n === 1) return "1 reader so far";
  return `${n} readers so far`;
}

export function wordsLabel(n: number): string {
  return `${n.toLocaleString("en-US")} words`;
}

// Live hold countdown. Returns e.g. "3h 58m left" or "expired".
export function remainingLabel(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

// A ticking clock for live countdowns.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
