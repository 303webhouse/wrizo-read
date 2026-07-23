import { hash, verify } from "@node-rs/argon2";

// argon2id (brief §5). @node-rs/argon2 defaults to Argon2id — the algorithm its own docs mark as
// the normative recommendation — so we rely on the default rather than the ambient const enum
// (which isolatedModules forbids referencing). Prebuilt binaries: no node-gyp, cross-platform.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}
