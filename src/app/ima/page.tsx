import { Radio } from "lucide-react";
import { EmptyState } from "@/components/primitives/empty-state";

export default function ImaPage() {
  return (
    <EmptyState
      icon={Radio}
      title="IMA is next"
      description="A dedicated tech-intelligence feed lands after the core modes are built."
    />
  );
}
