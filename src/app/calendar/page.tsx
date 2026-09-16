import { Calendar } from "lucide-react";
import { EmptyState } from "@/components/primitives/empty-state";

export default function CalendarPage() {
  return (
    <EmptyState
      icon={Calendar}
      title="Calendar is next"
      description="A full schedule view lands after the core modes are built."
    />
  );
}
