import { pause } from "@/server/spotify/client";
import { runPlaybackAction } from "@/server/spotify/route-helpers";

export async function POST() {
  return runPlaybackAction(() => pause());
}
