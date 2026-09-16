import { Settings } from "lucide-react";
import { EmptyState } from "@/components/primitives/empty-state";

export default function SettingsPage() {
  return (
    <EmptyState
      icon={Settings}
      title="Settings is next"
      description="Profile, appearance, voice, and integrations land after the core modes are built."
    />
  );
}
