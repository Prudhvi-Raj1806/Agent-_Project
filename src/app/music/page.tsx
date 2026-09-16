import { Music2 } from "lucide-react";
import { EmptyState } from "@/components/primitives/empty-state";

export default function MusicPage() {
  return (
    <EmptyState
      icon={Music2}
      title="Music is next"
      description="A full playback view lands after the core modes are built."
    />
  );
}
