import { uuidv7 } from "uuidv7";

// UUIDv7 everywhere (brief §1). Time-ordered ids, generated in the application layer.
export function newId(): string {
  return uuidv7();
}
