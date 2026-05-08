/**
 * Address → (lat,lng) geocoding.
 *
 * We try the Google Maps Geocoding API first (requires GOOGLE_API_KEY) so
 * dispatch distances and batching radii are real. If the API key is
 * missing, the network request fails, the result is empty, or the call
 * times out, we fall back to the deterministic synthetic helper in
 * `dispatch.addressLatLng` so dispatch never breaks because the geocoder
 * is unhappy.
 *
 * Successful lookups are cached in-memory by a normalised address key so
 * the same delivery address used twice in a session only costs one API
 * call.
 */
import { addressLatLng } from "./dispatch";
import { logger } from "./logger";

const GEOCODE_TIMEOUT_MS = 4_000;
const CACHE_MAX = 500;

const cache = new Map<string, { lat: number; lng: number }>();

export interface GeocodeAddress {
  line?: string | null;
  city?: string | null;
  pincode?: string | null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  source: "google" | "synthetic";
}

function cacheKey(addr: GeocodeAddress): string {
  return [
    (addr.line ?? "").trim().toLowerCase(),
    (addr.city ?? "").trim().toLowerCase(),
    (addr.pincode ?? "").trim().toLowerCase(),
  ].join("|");
}

function rememberCoord(key: string, coord: { lat: number; lng: number }): void {
  if (cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === "string") cache.delete(oldestKey);
  }
  cache.set(key, coord);
}

async function googleGeocode(
  addr: GeocodeAddress,
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) return null;
  const parts = [addr.line, addr.city, addr.pincode, "India"]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", parts.join(", "));
  url.searchParams.set("key", apiKey);
  url.searchParams.set("region", "in");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "geocode: google maps non-200, falling back to synthetic",
      );
      return null;
    }
    const json = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    if (json.status !== "OK") {
      // ZERO_RESULTS is a normal outcome for sparse addresses.
      if (json.status && json.status !== "ZERO_RESULTS") {
        logger.warn(
          { status: json.status },
          "geocode: google maps non-OK status",
        );
      }
      return null;
    }
    const loc = json.results?.[0]?.geometry?.location;
    if (
      !loc ||
      typeof loc.lat !== "number" ||
      typeof loc.lng !== "number" ||
      Number.isNaN(loc.lat) ||
      Number.isNaN(loc.lng)
    ) {
      return null;
    }
    return { lat: loc.lat, lng: loc.lng };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "geocode: google maps lookup failed",
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Geocode an address. Always resolves with a coordinate — synthetic if
 * real geocoding is unavailable — so callers never have to deal with
 * `null`. The `source` field tells you which path produced the value.
 */
export async function geocodeAddress(
  addr: GeocodeAddress,
): Promise<GeocodeResult> {
  const key = cacheKey(addr);
  const cached = cache.get(key);
  if (cached) return { ...cached, source: "google" };
  const real = await googleGeocode(addr);
  if (real) {
    rememberCoord(key, real);
    return { ...real, source: "google" };
  }
  const synthetic = addressLatLng(addr);
  return { ...synthetic, source: "synthetic" };
}
