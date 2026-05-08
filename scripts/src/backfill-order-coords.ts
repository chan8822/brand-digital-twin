/**
 * Backfill drop_lat / drop_lng on historical delivery orders.
 *
 * Task #46: orders placed before geocoding-at-checkout shipped have
 * `drop_lat` / `drop_lng` = NULL. Dispatch transparently falls back to
 * the synthetic helper for those rows, but reporting the real km savings
 * needs real coords. This script geocodes any delivery order missing
 * them and writes the result back.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run backfill-order-coords
 *
 * Honours --dry-run to log what would change without writing.
 *
 * Note: this script intentionally re-implements the geocoder rather than
 * importing from `@workspace/api-server` because scripts is a leaf
 * workspace package and may not depend on artifacts. If the real Google
 * geocoder ever moves into a shared lib (`lib/geocode`), swap the inline
 * implementation here for that import to keep both paths in sync.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 100;
const GEOCODE_TIMEOUT_MS = 4_000;

// MUST match `addressLatLng` in artifacts/api-server/src/lib/dispatch.ts
// byte-for-byte so synthetic-fallback rows from this backfill match what
// dispatch would compute at runtime. If the production helper changes,
// update this one in lockstep (or extract both into a shared lib).
const METRO_CENTERS: Record<string, { lat: number; lng: number }> = {
  "560": { lat: 12.9716, lng: 77.5946 },
  "110": { lat: 28.6139, lng: 77.209 },
  "400": { lat: 19.076, lng: 72.8777 },
  "600": { lat: 13.0827, lng: 80.2707 },
  "700": { lat: 22.5726, lng: 88.3639 },
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function syntheticLatLng(addr: {
  line: string | null;
  city: string | null;
  pincode: string | null;
}): { lat: number; lng: number } {
  const pin = (addr.pincode ?? "").trim();
  const center = METRO_CENTERS[pin.slice(0, 3)] ?? { lat: 12.97, lng: 77.59 };
  const seed = `${pin}|${addr.line ?? ""}|${addr.city ?? ""}`;
  const h = hash(seed);
  const dLat = (((h >>> 0) % 1200) - 600) / 10000;
  const dLng = ((((h >>> 8) >>> 0) % 1200) - 600) / 10000;
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}

async function googleGeocode(addr: {
  line: string | null;
  city: string | null;
  pincode: string | null;
}): Promise<{ lat: number; lng: number } | null> {
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
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    if (json.status !== "OK") return null;
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
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const rows = await db
    .select({
      id: ordersTable.id,
      addressLine: ordersTable.addressLine,
      city: ordersTable.city,
      pincode: ordersTable.pincode,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.fulfillmentType, "delivery"),
        or(isNull(ordersTable.dropLat), isNull(ordersTable.dropLng)),
      ),
    );
  console.log(
    `[backfill] ${rows.length} delivery orders missing coords (dry-run=${DRY_RUN})`,
  );
  let google = 0;
  let synthetic = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    for (const row of slice) {
      if (!row.addressLine && !row.city && !row.pincode) {
        skipped += 1;
        continue;
      }
      const real = await googleGeocode({
        line: row.addressLine,
        city: row.city,
        pincode: row.pincode,
      });
      const coord =
        real ??
        syntheticLatLng({
          line: row.addressLine,
          city: row.city,
          pincode: row.pincode,
        });
      if (real) google += 1;
      else synthetic += 1;
      if (!DRY_RUN) {
        await db
          .update(ordersTable)
          .set({ dropLat: coord.lat, dropLng: coord.lng })
          .where(eq(ordersTable.id, row.id));
      }
    }
    console.log(
      `[backfill] processed ${Math.min(i + BATCH, rows.length)}/${rows.length}`,
    );
  }
  console.log(
    `[backfill] done — google=${google} synthetic=${synthetic} skipped=${skipped}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  });
