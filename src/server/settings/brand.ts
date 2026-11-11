import { SETTING_DEFS } from "./schema";
import { getSetting } from "./store";

/**
 * The assistant's name and the owner's name for server code. Client code uses
 * `useBrand()` / `useOwnerName()` instead. A database that can't be read never
 * breaks a page over a name: both fall back to their defaults.
 */

export function getBrand(): string {
  try {
    return getSetting("persona.name");
  } catch {
    return SETTING_DEFS["persona.name"].default;
  }
}

export function getOwnerName(): string {
  try {
    return getSetting("persona.ownerName");
  } catch {
    return SETTING_DEFS["persona.ownerName"].default;
  }
}
