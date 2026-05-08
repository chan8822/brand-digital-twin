export interface SavedAddress {
  id: string;
  label: string;
  type: "home" | "work";
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  phone: string;
}

export const SAVED_ADDRESSES: SavedAddress[] = [
  {
    id: "addr-1",
    label: "Home — Koramangala",
    type: "home",
    line1: "8th Block, 5th Cross",
    line2: "Apt 304, Lake View Residency",
    city: "Bengaluru",
    pincode: "560095",
    phone: "+91 98765 43210",
  },
  {
    id: "addr-2",
    label: "Office — MG Road",
    type: "work",
    line1: "Prestige Trade Tower, MG Road",
    line2: "3rd Floor, Suite 312",
    city: "Bengaluru",
    pincode: "560001",
    phone: "+91 98765 43210",
  },
];
