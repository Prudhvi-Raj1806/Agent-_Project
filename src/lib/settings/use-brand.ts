"use client";

import { useAppSettings } from "./app-settings-context";

/** The assistant's name, live from settings. Server code uses `getBrand()`. */
export function useBrand(): string {
  return useAppSettings().settings["persona.name"];
}

/** What the assistant calls its owner, live from settings. Server code uses `getOwnerName()`. */
export function useOwnerName(): string {
  return useAppSettings().settings["persona.ownerName"];
}
