import Image from "next/image";
import { Panel } from "@/components/primitives/panel";
import { cn } from "@/lib/utils";

/** A quiet personality touch in the corner of the grid — photo with a text overlay. */
export function AmbientPanel({
  title = "Stay consistent.",
  subtitle = "Good tools, better thinking.",
  className,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Panel className={cn("relative flex flex-col justify-end overflow-hidden p-5", className)}>
      <Image
        src="/Jarvis Inspo Cover.png"
        alt=""
        fill
        sizes="(min-width: 1024px) 25vw, 100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <p className="relative text-sm font-medium text-foreground">{title}</p>
      <p className="relative mt-1 text-xs text-white/70">{subtitle}</p>
    </Panel>
  );
}
