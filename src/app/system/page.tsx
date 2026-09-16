import { Cpu } from "lucide-react";
import { EmptyState } from "@/components/primitives/empty-state";

export default function SystemPage() {
  return (
    <EmptyState
      icon={Cpu}
      title="System is next"
      description="A full operating-system monitor lands after the core modes are built."
    />
  );
}
