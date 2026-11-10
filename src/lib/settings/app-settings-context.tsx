"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { SettingsShape } from "@/server/settings/schema";

interface AppSettingsValue {
  settings: SettingsShape;
  /** Saves a partial update; applies what the server returns, or throws the server's message. */
  update: (patch: Partial<SettingsShape>) => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

export function AppSettingsProvider({ initial, children }: { initial: SettingsShape; children: React.ReactNode }) {
  const [settings, setSettings] = useState(initial);

  const update = useCallback(async (patch: Partial<SettingsShape>) => {
    const res = await fetch("/api/app-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as SettingsShape & { error?: string };
    if (!res.ok) throw new Error(body.error ?? "Couldn't save that setting.");
    setSettings(body);
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsValue {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error("useAppSettings must be used inside AppSettingsProvider.");
  return value;
}
