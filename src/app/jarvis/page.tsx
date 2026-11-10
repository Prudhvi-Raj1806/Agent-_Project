import { JarvisScreen } from "@/components/jarvis/jarvis-screen";
import { getNews } from "@/server/news/service";
import { getUiSchedule } from "@/server/schedule/view";
import { getUiSystemStatus } from "@/server/system/view";
import { getCurrentWeather } from "@/server/weather/service";

// Live telemetry, schedule, weather and feeds — render fresh per request.
export const dynamic = "force-dynamic";

export default async function JarvisPage() {
  const [system, schedule, weather, news] = await Promise.all([
    getUiSystemStatus(),
    getUiSchedule(),
    getCurrentWeather(),
    getNews(),
  ]);

  return <JarvisScreen system={system} schedule={schedule} weather={weather} news={news} />;
}
