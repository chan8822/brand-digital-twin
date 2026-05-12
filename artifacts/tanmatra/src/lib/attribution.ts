// First-touch attribution capture.
//
// On every page load (call `captureAttribution()` from a top-level mount
// effect), we look at the current URL's query string for `utm_*`, `ref`, and
// `gclid`. If we find anything AND we don't already have an attribution
// record persisted in localStorage, we save it.
//
// "First-touch" semantics: once captured, the record is sticky for the life
// of the browser profile. A user who lands from `?utm_source=google`, browses
// for a week, then signs up after clicking a `?utm_source=referral` link
// will be attributed to Google — that's the more meaningful acquisition
// signal for low-frequency commerce.
//
// Limitations / known trade-offs:
//   - localStorage is per-origin per-browser. Different browser, lost.
//   - We don't write a server-side cookie, so attribution captured on a
//     marketing site (e.g. landing page) doesn't carry over here. (When/if we
//     unify to a single domain, switch to a 1st-party cookie.)
//   - We capture the *first* hit of each browser, not the *first* hit per
//     campaign — so a user who returns months later via a new campaign won't
//     get re-attributed. This is intentional.

const STORAGE_KEY = "tanmatra:attribution:v1";

export interface AttributionRecord {
  signupSource?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referralCode?: string;
  capturedAt: string; // ISO
}

function safeRead(): AttributionRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AttributionRecord;
    return parsed;
  } catch {
    return null;
  }
}

function safeWrite(record: AttributionRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* localStorage disabled — silently degrade */
  }
}

/**
 * Inspect `window.location.search`; if it contains attribution-relevant
 * params AND we don't already have a record, save it. Idempotent and cheap
 * to call on every mount.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  // Already have a first-touch record — preserve it.
  if (safeRead()) return;

  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source") ?? undefined;
  const utmMedium = params.get("utm_medium") ?? undefined;
  const utmCampaign = params.get("utm_campaign") ?? undefined;
  const referralCode = params.get("ref") ?? undefined;
  const gclid = params.get("gclid");

  // Nothing to capture, and no record exists. Skip — we don't want to write
  // an empty record that would block a future genuine capture.
  if (!utmSource && !utmMedium && !utmCampaign && !referralCode && !gclid) {
    return;
  }

  // Heuristic for `signupSource`: prefer explicit utm_source, else "google_ads"
  // if a gclid was present, else "referral" if a ref code was present, else
  // "direct".
  const signupSource =
    utmSource ?? (gclid ? "google_ads" : referralCode ? "referral" : "direct");

  safeWrite({
    signupSource,
    utmSource,
    utmMedium,
    utmCampaign,
    referralCode,
    capturedAt: new Date().toISOString(),
  });
}

/**
 * Read the persisted attribution record (if any). Returns the same shape the
 * server expects in `PhoneVerifyOtpBody.attribution`, minus the consent
 * fields (those come from explicit form input).
 */
export function getAttribution(): Omit<AttributionRecord, "capturedAt"> | null {
  const r = safeRead();
  if (!r) return null;
  const { capturedAt: _capturedAt, ...rest } = r;
  return rest;
}
