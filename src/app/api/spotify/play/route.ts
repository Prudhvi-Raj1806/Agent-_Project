import { play } from "@/server/spotify/client";
import { runPlaybackAction } from "@/server/spotify/route-helpers";

export async function POST() {
  return runPlaybackAction(() => play());
}
