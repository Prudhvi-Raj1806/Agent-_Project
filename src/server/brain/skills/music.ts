import {
  SpotifyNoActiveDeviceError,
  SpotifyNotConnectedError,
  SpotifyPremiumRequiredError,
} from "@/server/spotify/client";
import type { BrainSkill, SkillSources } from "./types";

/** Says what went wrong in words the owner can act on. Music is not retried through Hermes. */
function explain(err: unknown): { ok: false; reply: string } {
  if (err instanceof SpotifyNotConnectedError) return { ok: false, reply: "Spotify isn't connected. Connect it in Settings." };
  if (err instanceof SpotifyNoActiveDeviceError) return { ok: false, reply: "No Spotify player is open." };
  if (err instanceof SpotifyPremiumRequiredError) return { ok: false, reply: "Spotify needs Premium for that." };
  return { ok: false, reply: "I can't reach Spotify right now." };
}

export function musicSkills({ music }: Pick<SkillSources, "music">): BrainSkill[] {
  const control = (
    id: string,
    description: string,
    examples: string[],
    act: () => Promise<void>,
    reply: string,
  ): BrainSkill => ({
    id,
    description,
    examples,
    needsInternet: true,
    async run() {
      try {
        await act();
        return { ok: true, reply };
      } catch (err) {
        return explain(err);
      }
    },
  });

  return [
    control("music.play", "asks to play or resume music", ["play some music", "play music"], () => music.play(), "Playing."),
    control("music.pause", "asks to pause or stop the music", ["pause the music", "pause"], () => music.pause(), "Paused."),
    control(
      "music.next",
      "asks to skip to the next song or track",
      ["next song", "skip to the next song", "skip this one"],
      () => music.next(),
      "Skipped.",
    ),
    control(
      "music.previous",
      "asks to go back to the previous song or track",
      ["previous song", "go back to the last song"],
      () => music.previous(),
      "Going back.",
    ),
    {
      id: "music.now-playing",
      description: "asks which song or artist is playing now",
      examples: ["what's this song", "what am I listening to"],
      needsInternet: true,
      async run() {
        try {
          const { isPlaying, track } = await music.nowPlaying();
          if (!isPlaying || !track) return { ok: true, reply: "Nothing is playing." };
          return { ok: true, reply: `Playing ${track.title} by ${track.artist}.` };
        } catch (err) {
          return explain(err);
        }
      },
    },
  ];
}
