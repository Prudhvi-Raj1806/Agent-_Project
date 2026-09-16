import { logger } from "@/server/logging/logger";
import type { WeatherCondition, WeatherStatus } from "@/lib/data/types";

/**
 * Real weather via Open-Meteo (free, keyless). Location comes from
 * JARVIS_LATITUDE/JARVIS_LONGITUDE if set, otherwise best-effort IP
 * geolocation via a free, keyless service. If neither works, returns null —
 * the UI hides the chip rather than showing a guessed location's weather.
 */

const CACHE_TTL_MS = 15 * 60_000;
let cache: { value: WeatherStatus | null; expiresAt: number } | null = null;

function codeToCondition(code: number): { condition: WeatherCondition; label: string } {
  if (code === 0) return { condition: "clear", label: "Clear" };
  if (code <= 3) return { condition: "clouds", label: code === 1 ? "Mostly clear" : "Cloudy" };
  if (code === 45 || code === 48) return { condition: "clouds", label: "Foggy" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { condition: "rain", label: "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { condition: "snow", label: "Snow" };
  if (code >= 95) return { condition: "rain", label: "Thunderstorm" };
  return { condition: "clouds", label: "Cloudy" };
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

function envCoordinates(): Coordinates | null {
  const lat = process.env.JARVIS_LATITUDE;
  const lon = process.env.JARVIS_LONGITUDE;
  if (!lat || !lon) return null;
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return { latitude, longitude };
}

async function ipCoordinates(): Promise<Coordinates | null> {
  try {
    const res = await fetch("http://ip-api.com/json/?fields=status,lat,lon", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "success") return null;
    return { latitude: data.lat, longitude: data.lon };
  } catch (err) {
    logger.warn("weather.ip_geolocation.failed", { error: String(err) });
    return null;
  }
}

async function fetchWeather(): Promise<WeatherStatus | null> {
  const coords = envCoordinates() ?? (await ipCoordinates());
  if (!coords) return null;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const temperatureC = Math.round(data.current?.temperature_2m);
    const code = data.current?.weather_code;
    if (Number.isNaN(temperatureC) || typeof code !== "number") return null;
    const { condition, label } = codeToCondition(code);
    return { temperatureC, condition, label };
  } catch (err) {
    logger.warn("weather.fetch.failed", { error: String(err) });
    return null;
  }
}

export async function getCurrentWeather(): Promise<WeatherStatus | null> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;
  const value = await fetchWeather();
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
