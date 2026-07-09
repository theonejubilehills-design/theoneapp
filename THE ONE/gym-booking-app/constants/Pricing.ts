import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

export interface ServiceItem {
  name: string;
  price: number;
}

// ─── Default (hardcoded) prices ───────────────────────────────────────────────
export const SALON_SERVICES: ServiceItem[] = [
  { name: 'Haircut + Hairwash + Blowdry (Men)', price: 1000 },
  { name: 'Beard Trim', price: 400 },
  { name: 'Shaving', price: 500 },
  { name: 'Head Shave', price: 700 },
  { name: 'Hair wash + Blowdry (Men)', price: 500 },
  { name: "Hair Color Root Touch-up (Men) *Client's Product", price: 800 },
  { name: 'Hair wash + Simple Blowdry (Women)', price: 1000 },
  { name: 'Hair wash + Soft Curls (Inward/Outward)', price: 1200 },
  { name: 'Hair wash + Tong Curls', price: 1300 },
  { name: "Hair Color Root Touch-up (Women) *Client's Product", price: 1100 },
];

export const SPA_SERVICES: ServiceItem[] = [
  { name: 'Head Massage (20 Mins)', price: 500 },
  { name: 'Neck + Back Massage (30 Mins)', price: 1000 },
  { name: 'Foot Massage (20 Mins)', price: 700 },
  { name: 'Body Massage - Fusion (60 Mins)', price: 3000 },
  { name: 'Body Massage - Deep Tissue (60 Mins)', price: 3000 },
];

export const PHYSIO_SERVICES: ServiceItem[] = [
  { name: 'Ultrasound', price: 2000 },
  { name: 'IFT', price: 2000 },
  { name: 'Cupping - Dry', price: 2000 },
  { name: 'Needling', price: 2000 },
  { name: 'Manual Release', price: 2000 },
];

export const DEFAULT_WELLNESS_PRICES: Record<string, number> = {
  sauna: 500,
  hbot: 3000,
  cryo: 3000,
  'red-light': 3000,
};

export const getWellnessPrice = (svcId: string): number =>
  DEFAULT_WELLNESS_PRICES[svcId] ?? 0;

// ─── Firestore-backed live pricing ───────────────────────────────────────────
// Fetches settings/pricing from Firestore and merges with defaults.
// Returns arrays with the same shape as the static arrays above.

export interface LivePricing {
  salon:    ServiceItem[];
  spa:      ServiceItem[];
  physio:   ServiceItem[];
  wellnessPrice: (svcId: string) => number;
}

export async function fetchLivePricing(): Promise<LivePricing> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'pricing'));
    const data = snap.exists() ? (snap.data() as any) : {};

    const merge = (defaults: ServiceItem[], override: Record<string, number> = {}): ServiceItem[] =>
      defaults.map(s => ({ name: s.name, price: override[s.name] ?? s.price }));

    return {
      salon:   merge(SALON_SERVICES,  data.salon),
      spa:     merge(SPA_SERVICES,    data.spa),
      physio:  merge(PHYSIO_SERVICES, data.physio),
      wellnessPrice: (svcId: string) =>
        data.wellness?.[svcId] ?? DEFAULT_WELLNESS_PRICES[svcId] ?? 0,
    };
  } catch {
    // Firestore unavailable — fall back to hardcoded defaults
    return {
      salon:   SALON_SERVICES,
      spa:     SPA_SERVICES,
      physio:  PHYSIO_SERVICES,
      wellnessPrice: getWellnessPrice,
    };
  }
}
