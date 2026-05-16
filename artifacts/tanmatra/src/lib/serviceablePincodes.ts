// Minimal serviceable-pincode lookup for the Bengaluru launch zone.
// Each entry: pincode → { area, city }. Used by the Checkout new-
// address form for inline serviceability + city auto-fill.
//
// This is the SHIPPING-SIDE source of truth; the server is expected to
// re-validate at order finalize. Edit this map when ops adds zones.
//
// To extend beyond Bengaluru, replace with a lazy fetch against the
// India Post Pincode API (`api.postalpincode.in/pincode/{pin}`) and
// cache responses — but for the current single-city footprint a
// static map is faster and offline-safe.
export interface PincodeInfo {
  area: string;
  city: string;
  state: string;
}

const SERVICEABLE: Record<string, PincodeInfo> = {
  // Central Bengaluru
  "560001": { area: "Bangalore GPO", city: "Bengaluru", state: "Karnataka" },
  "560002": { area: "Chickpet", city: "Bengaluru", state: "Karnataka" },
  "560003": { area: "Malleswaram", city: "Bengaluru", state: "Karnataka" },
  "560004": { area: "Basavanagudi", city: "Bengaluru", state: "Karnataka" },
  "560005": { area: "Frazer Town", city: "Bengaluru", state: "Karnataka" },
  "560008": { area: "Indiranagar HAL", city: "Bengaluru", state: "Karnataka" },
  "560011": { area: "Jayanagar", city: "Bengaluru", state: "Karnataka" },
  "560017": { area: "Domlur", city: "Bengaluru", state: "Karnataka" },
  "560020": { area: "Seshadripuram", city: "Bengaluru", state: "Karnataka" },
  "560024": { area: "Sanjaynagar", city: "Bengaluru", state: "Karnataka" },
  "560025": { area: "Richmond Town", city: "Bengaluru", state: "Karnataka" },
  "560027": { area: "Shivajinagar", city: "Bengaluru", state: "Karnataka" },
  "560029": { area: "Ejipura", city: "Bengaluru", state: "Karnataka" },
  "560034": { area: "Koramangala", city: "Bengaluru", state: "Karnataka" },
  "560038": { area: "Indiranagar", city: "Bengaluru", state: "Karnataka" },
  "560042": { area: "Tasker Town", city: "Bengaluru", state: "Karnataka" },
  "560043": { area: "HBR Layout", city: "Bengaluru", state: "Karnataka" },
  "560047": { area: "Viveknagar", city: "Bengaluru", state: "Karnataka" },
  "560048": { area: "Whitefield", city: "Bengaluru", state: "Karnataka" },
  "560066": { area: "Bellandur / Whitefield", city: "Bengaluru", state: "Karnataka" },
  "560068": { area: "BTM Layout", city: "Bengaluru", state: "Karnataka" },
  "560071": { area: "Murugeshpalya", city: "Bengaluru", state: "Karnataka" },
  "560076": { area: "Banashankari", city: "Bengaluru", state: "Karnataka" },
  "560078": { area: "Padmanabhanagar", city: "Bengaluru", state: "Karnataka" },
  "560083": { area: "BTM 2nd Stage", city: "Bengaluru", state: "Karnataka" },
  "560085": { area: "JP Nagar", city: "Bengaluru", state: "Karnataka" },
  "560093": { area: "Lingarajapuram", city: "Bengaluru", state: "Karnataka" },
  "560094": { area: "RT Nagar", city: "Bengaluru", state: "Karnataka" },
  "560095": { area: "Koramangala", city: "Bengaluru", state: "Karnataka" },
  "560097": { area: "Yelahanka", city: "Bengaluru", state: "Karnataka" },
  "560100": { area: "Electronic City", city: "Bengaluru", state: "Karnataka" },
  "560102": { area: "HSR Layout", city: "Bengaluru", state: "Karnataka" },
  "560103": { area: "Marathahalli", city: "Bengaluru", state: "Karnataka" },
  "560111": { area: "Sarjapur Road", city: "Bengaluru", state: "Karnataka" },
};

const PINCODE_RE = /^\d{6}$/;

export type PincodeCheckResult =
  | { state: "empty" }
  | { state: "invalid" }
  | { state: "unserviceable"; pincode: string }
  | { state: "serviceable"; pincode: string; info: PincodeInfo };

export function checkPincode(raw: string): PincodeCheckResult {
  const v = raw.trim();
  if (!v) return { state: "empty" };
  if (!PINCODE_RE.test(v)) return { state: "invalid" };
  const info = SERVICEABLE[v];
  if (!info) return { state: "unserviceable", pincode: v };
  return { state: "serviceable", pincode: v, info };
}
