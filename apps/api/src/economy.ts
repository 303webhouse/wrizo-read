// foundations §6 — the anti-molarization law. One currency, a fixed price list, forever:
//
//   "Filing an accepted reading earns 1 credit. Filing a queue piece costs 2 credits. Filing a
//    Volume costs 4 credits (and bypasses the quota engine). No new currencies, no exchange
//    rates, no bundles, no badges, no pay-to-skip. The moment credits become capital, the floor
//    molarizes. This clause exists to be pointed at."
//
// The prices live here, once — the law is one edit in one place. Point at this file.
export const READING_EARNS = 1;
export const QUEUE_COSTS = 2;
export const VOLUME_COSTS = 4;
export const READING_FLOOR_WORDS = 120;

export function postCost(kind: "queue" | "volume"): number {
  return kind === "volume" ? VOLUME_COSTS : QUEUE_COSTS;
}
