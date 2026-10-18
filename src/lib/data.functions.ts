import { createServerFn } from "@tanstack/react-start";

export type Bounds = { s: number; w: number; n: number; e: number };
export type FuelKey = "benzina" | "diesel" | "gpl" | "metano";

export type FuelStation = {
  id: string;
  name: string;
  brand: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  prices: { fuel: string; price: number; self: boolean; date: string }[];
  best: number | null;
};

export type Charger = {
  id: string;
  name: string;
  operator: string;
  lat: number;
  lng: number;
  sockets: string;
  capacity: string;
  power: string;
};

export type NewsItem = { title: string; link: string; source: string; date: string };

type Raw = Omit<FuelStation, "best">;
const UA = { "User-Agent": "Mozilla/5.0 (CarburantiLive/1.0)", Accept: "*/*" };
let cache: { at: number; stations: Raw[] } | null = null;

function splitLine(line: string, sep: string) {
  return line.split(sep).map((s) => s.trim());
}

async function loadMimit(): Promise<Raw[]> {
  if (cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.stations;
  const [anaRes, prRes] = await Promise.all([
    fetch("https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv", { headers: UA, signal: AbortSignal.timeout(40000) }),
    fetch("https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv", { headers: UA, signal: AbortSignal.timeout(40000) }),
  ]);
  if (!anaRes.ok || !prRes.ok) throw new Error(`MIMIT non raggiungibile (${anaRes.status}/${prRes.status})`);
  const [ana, pr] = await Promise.all([anaRes.text(), prRes.text()]);

  const map = new Map<string, Raw>();
  const anaLines = ana.split(/\r?\n/);
  const sepA = anaLines[1]?.includes("|") ? "|" : ";";
  for (let i = 2; i < anaLines.length; i++) {
    const c = splitLine(anaLines[i], sepA);
    if (c.length < 10) continue;
    const lat = parseFloat(c[8]);
    const lng = parseFloat(c[9]);
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) continue;
    map.set(c[0], {
      id: c[0],
      name: c[4] || c[1],
      brand: c[2],
      address: c[5],
      city: `${c[6]} (${c[7]})`,
      lat,
      lng,
      prices: [],
    });
  }
  const prLines = pr.split(/\r?\n/);
  const sepP = prLines[1]?.includes("|") ? "|" : ";";
  for (let i = 2; i < prLines.length; i++) {
    const c = splitLine(prLines[i], sepP);
    if (c.length < 5) continue;
    const s = map.get(c[0]);
    const price = parseFloat(c[2]);
    if (!s || !isFinite(price) || price <= 0) continue;
    s.prices.push({ fuel: c[1], price, self: c[3] === "1", date: c[4] });
  }
  const stations = [...map.values()].filter((s) => s.prices.length);
  cache = { at: Date.now(), stations };
  return stations;
}

const FUEL_MATCH: Record<FuelKey, (f: string) => boolean> = {
  benzina: (f) => /^benzina/i.test(f),
  diesel: (f) => /gasolio|diesel/i.test(f) && !/riscaldamento/i.test(f),
  gpl: (f) => /gpl/i.test(f),
  metano: (f) => /metano|gnl|l-gnc/i.test(f),
};

function parseBounds(d: unknown): Bounds {
  const b = d as Bounds;
  for (const k of ["s", "w", "n", "e"] as const) {
    if (typeof b?.[k] !== "number" || !isFinite(b[k])) throw new Error("bounds non validi");
  }
  return b;
}

export const getFuelStations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as { bounds: unknown; fuel: FuelKey };
    if (!["benzina", "diesel", "gpl", "metano"].includes(x?.fuel)) throw new Error("fuel");
    return { bounds: parseBounds(x.bounds), fuel: x.fuel };
  })
  .handler(async ({ data }) => {
    const all = await loadMimit();
    const { s, w, n, e } = data.bounds;
    const match = FUEL_MATCH[data.fuel];
    const out: FuelStation[] = [];
    for (const st of all) {
      if (st.lat < s || st.lat > n || st.lng < w || st.lng > e) continue;
      const rel = st.prices.filter((p) => match(p.fuel));
      if (!rel.length) continue;
      const selfP = rel.filter((p) => p.self).map((p) => p.price);
      const best = Math.min(...(selfP.length ? selfP : rel.map((p) => p.price)));
      out.push({ ...st, best });
      if (out.length >= 600) break;
    }
    return out;
  });

export const getChargers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ({ bounds: parseBounds((d as { bounds: unknown })?.bounds) }))
  .handler(async ({ data }) => {
    const { s, w, n, e } = data.bounds;
    const q = `[out:json][timeout:25];node["amenity"="charging_station"](${s},${w},${n},${e});out 500;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(q),
    });
    if (!res.ok) throw new Error(`Servizio colonnine non disponibile (${res.status})`);
    const json = (await res.json()) as {
      elements: { id: number; lat: number; lon: number; tags?: Record<string, string> }[];
    };
    return json.elements.map((el): Charger => {
      const t = el.tags ?? {};
      const sockets = Object.keys(t)
        .filter((k) => k.startsWith("socket:") && !k.includes(":", 7))
        .map((k) => `${k.slice(7)} ×${t[k]}`)
        .join(", ");
      const power = Object.keys(t)
        .filter((k) => k.endsWith(":output"))
        .map((k) => t[k])
        .join(", ");
      return {
        id: String(el.id),
        name: t.name || t.operator || "Colonnina di ricarica",
        operator: t.operator || t.network || t.brand || "—",
        lat: el.lat,
        lng: el.lon,
        sockets: sockets || "—",
        capacity: t.capacity || "—",
        power: power || "—",
      };
    });
  });

const FEEDS: { source: string; url: string }[] = [
  { source: "ANSA", url: "https://www.ansa.it/sito/notizie/economia/economia_rss.xml" },
  { source: "Sky TG24", url: "https://tg24.sky.it/rss/tg24_economia.xml" },
  { source: "Rai News", url: "https://www.rainews.it/rss/economia" },
  ...[
    ["TG1 / Rai", "rainews.it"],
    ["TG5 / Tgcom24", "tgcom24.mediaset.it"],
    ["La7", "la7.it"],
    ["Il Sole 24 Ore", "ilsole24ore.com"],
    ["Sky TG24", "tg24.sky.it"],
    ["ANSA", "ansa.it"],
  ].map(([source, site]) => ({
    source,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(`(benzina OR carburanti OR petrolio OR greggio) site:${site} when:3d`)}&hl=it&gl=IT&ceid=IT:it`,
  })),
  {
    source: "International",
    url: `https://news.google.com/rss/search?q=${encodeURIComponent("oil prices OR gasoline OR brent OR OPEC when:2d")}&hl=en-US&gl=US&ceid=US:en`,
  },
];

const KEYWORDS = /benzin|carburant|petroli|greggio|gasolio|diesel|brent|wti|opec|accise|pieno|oil|gasoline|crude|fuel|barrel|barile|raffiner/i;

const clean = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

export const getNews = createServerFn({ method: "GET" }).handler(async () => {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const r = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 CarburantiDashboard" } });
      if (!r.ok) return [];
      const xml = await r.text();
      const items: NewsItem[] = [];
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const b = m[1] ?? "";
        const title = clean(b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
        const link = clean(b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
        const date = clean(b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "");
        const src = clean(b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "") || f.source;
        if (title && link && KEYWORDS.test(title)) items.push({ title, link, source: src, date });
      }
      return items;
    }),
  );
  const seen = new Set<string>();
  const all = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((i) => {
      const k = i.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return all.slice(0, 40);
});
