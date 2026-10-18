// Pure MIMIT CSV parsing, shared by server and browser.
export type FuelKey = "benzina" | "diesel" | "gpl" | "metano";

export type Price = { fuel: string; price: number; self: boolean; date: string };
export type FuelStation = {
  id: string;
  name: string;
  brand: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  prices: Price[];
};

export const MIMIT_ANAGRAFICA = "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv";
export const MIMIT_PREZZI = "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";

const cols = (line: string | undefined, sep: string) => (line ?? "").split(sep).map((s) => s.trim());

export function parseMimit(ana: string, pr: string): FuelStation[] {
  const map = new Map<string, FuelStation>();
  const a = ana.split(/\r?\n/);
  const sepA = a[1]?.includes("|") ? "|" : ";";
  for (let i = 2; i < a.length; i++) {
    const c = cols(a[i], sepA);
    if (c.length < 10) continue;
    const lat = parseFloat(c[8] ?? "");
    const lng = parseFloat(c[9] ?? "");
    if (!isFinite(lat) || !isFinite(lng) || lat < 35 || lat > 48 || lng < 6 || lng > 19) continue;
    map.set(c[0] ?? "", {
      id: c[0] ?? "",
      name: c[4] || c[1] || "Distributore",
      brand: c[2] ?? "",
      address: c[5] ?? "",
      city: `${c[6] ?? ""} (${c[7] ?? ""})`,
      lat: +lat.toFixed(5),
      lng: +lng.toFixed(5),
      prices: [],
    });
  }
  const p = pr.split(/\r?\n/);
  const sepP = p[1]?.includes("|") ? "|" : ";";
  for (let i = 2; i < p.length; i++) {
    const c = cols(p[i], sepP);
    if (c.length < 5) continue;
    const s = map.get(c[0] ?? "");
    const price = parseFloat(c[2] ?? "");
    if (!s || !isFinite(price) || price <= 0) continue;
    s.prices.push({ fuel: c[1] ?? "", price, self: c[3] === "1", date: c[4] ?? "" });
  }
  return [...map.values()].filter((s) => s.prices.length);
}

export const FUEL_MATCH: Record<FuelKey, (f: string) => boolean> = {
  benzina: (f) => /^benzina/i.test(f),
  diesel: (f) => /gasolio|diesel/i.test(f) && !/riscaldamento/i.test(f),
  gpl: (f) => /gpl/i.test(f),
  metano: (f) => /metano|gnl|l-gnc/i.test(f),
};

/** Lowest self-service price for the fuel (falls back to attended), or null. */
export function bestPrice(s: FuelStation, fuel: FuelKey): number | null {
  const rel = s.prices.filter((p) => FUEL_MATCH[fuel](p.fuel));
  if (!rel.length) return null;
  const self = rel.filter((p) => p.self);
  return Math.min(...(self.length ? self : rel).map((p) => p.price));
}
