import { Cloud, CloudRain, CloudSnow, Sun } from "lucide-react";
import type { WeatherCondition, WeatherStatus } from "@/lib/data/types";

const conditionIcon: Record<WeatherCondition, typeof Sun> = {
  clear: Sun,
  clouds: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
};

export function WeatherChip({ weather }: { weather: WeatherStatus | null }) {
  if (!weather) return null;
  const Icon = conditionIcon[weather.condition];
  return (
    <div className="hidden items-center gap-2 text-muted-foreground md:flex">
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <div className="leading-tight">
        <p className="text-sm text-foreground tabular-nums">{weather.temperatureC}°C</p>
        <p className="text-xs text-muted-foreground">{weather.label}</p>
      </div>
    </div>
  );
}
