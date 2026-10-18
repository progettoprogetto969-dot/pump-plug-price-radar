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

export type NewsItem = { title: string; link: string; source: string; date: string; image: string | null };

type Raw = Omit<FuelStation, "best">;
const UA = { "User-Agent": "Mozilla/5.0 (CarburantiLive/1.0)", Accept: "*/*" };
let cache: { at: number; stations: Raw[] } | null = null;

function splitLine(line: string | undefined, sep: string): string[] {
  return (line ?? "").split(sep).map((s) => s.trim());
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
    const c = splitLine(anaLines[i], sepA) as [string, string, string, string, string, string, string, string, string, string];
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
    const c = splitLine(prLines[i], sepP) as [string, string, string, string, string, string, string, string, string, string];
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

export type StationPin = { id: string; lat: number; lng: number; best: number };

const ALL_ITALY: Bounds = { s: 35.4, w: 6.5, n: 47.2, e: 18.6 };

export const getFuelStations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as { fuel: FuelKey };
    if (!["benzina", "diesel", "gpl", "metano"].includes(x?.fuel)) throw new Error("fuel");
    return { fuel: x.fuel };
  })
  .handler(async ({ data }): Promise<StationPin[]> => {
    const all = await loadMimit();
    const match = FUEL_MATCH[data.fuel];
    const out: StationPin[] = [];
    for (const st of all) {
      const rel = st.prices.filter((p) => match(p.fuel));
      if (!rel.length) continue;
      const selfP = rel.filter((p) => p.self).map((p) => p.price);
      const best = Math.min(...(selfP.length ? selfP : rel.map((p) => p.price)));
      out.push({ id: st.id, lat: +st.lat.toFixed(5), lng: +st.lng.toFixed(5), best });
    }
    return out;
  });

export const getStation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ({ id: String((d as { id: unknown })?.id ?? "") }))
  .handler(async ({ data }): Promise<FuelStation | null> => {
    const st = (await loadMimit()).find((s) => s.id === data.id);
    return st ? { ...st, best: null } : null;
  });

let evCache: { at: number; list: Charger[] } | null = null;

async function ocmItaly(key: string): Promise<Charger[]> {
  if (evCache && Date.now() - evCache.at < 6 * 60 * 60 * 1000) return evCache.list;
  const res = await fetch(
    `https://api.openchargemap.io/v3/poi/?output=json&countrycode=IT&maxresults=60000&compact=true&verbose=false&key=${encodeURIComponent(key)}`,
    { headers: UA, signal: AbortSignal.timeout(50000) },
  );
  if (!res.ok) throw new Error(`Open Charge Map: errore ${res.status}`);
  type Poi = {
    ID: number;
    NumberOfPoints?: number;
    AddressInfo: { Title?: string; Latitude: number; Longitude: number; AddressLine1?: string; Town?: string };
    Connections?: { PowerKW?: number; Quantity?: number }[];
  };
  const json = (await res.json()) as Poi[];
  const list = json.map((p): Charger => {
    const kw = (p.Connections ?? []).map((c) => c.PowerKW).filter((x): x is number => !!x);
    return {
      id: String(p.ID),
      name: p.AddressInfo.Title || "Colonnina di ricarica",
      operator: [p.AddressInfo.AddressLine1, p.AddressInfo.Town].filter(Boolean).join(", ") || "—",
      lat: p.AddressInfo.Latitude,
      lng: p.AddressInfo.Longitude,
      sockets: `${(p.Connections ?? []).length} connettori`,
      capacity: p.NumberOfPoints ? String(p.NumberOfPoints) : "—",
      power: kw.length ? `fino a ${Math.max(...kw)} kW` : "—",
    };
  });
  evCache = { at: Date.now(), list };
  return list;
}

export const getEvMode = createServerFn({ method: "GET" }).handler(async () => ({
  nationwide: !!process.env['OCM_API_KEY'],
}));

export const getChargers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const b = (d as { bounds?: unknown })?.bounds;
    return { bounds: b ? parseBounds(b) : ALL_ITALY };
  })
  .handler(async ({ data }) => {
    const key = process.env['OCM_API_KEY'];
    if (key) return { source: "ocm" as const, list: await ocmItaly(key) };
    const { s, w, n, e } = data.bounds;
    const q = `[out:json][timeout:25];node["amenity"="charging_station"](${s},${w},${n},${e});out 1500;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(q),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Servizio colonnine non disponibile (${res.status})`);
    const json = (await res.json()) as {
      elements: { id: number; lat: number; lon: number; tags?: Record<string, string> }[];
    };
    const list = json.elements.map((el): Charger => {
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
        name: t["name"] || t["operator"] || "Colonnina di ricarica",
        operator: t["operator"] || t["network"] || t["brand"] || "—",
        lat: el.lat,
        lng: el.lon,
        sockets: sockets || "—",
        capacity: t["capacity"] || "—",
        power: power || "—",
      };
    });
    return { source: "osm" as const, list };
  });

const FEEDS: { source: string; url: string }[] = [
  { source: "ANSA", url: "https://www.ansa.it/sito/notizie/economia/economia_rss.xml" },
  { source: "ANSA", url: "https://www.ansa.it/sito/ansait_rss.xml" },
  { source: "Sky TG24", url: "https://tg24.sky.it/rss/tg24_economia.xml" },
  { source: "TG5 / Tgcom24", url: "https://www.tgcom24.mediaset.it/rss/economia.xml" },
  { source: "Il Sole 24 Ore", url: "https://www.ilsole24ore.com/rss/economia.xml" },
  { source: "la Repubblica", url: "https://www.repubblica.it/rss/economia/rss2.0.xml" },
  { source: "Corriere della Sera", url: "https://www.corriere.it/rss/economia.xml" },
  { source: "QuiFinanza", url: "https://quifinanza.it/feed/" },
  ...[
    ["TG1 / Rai News", "rainews.it"],
    ["La7", "la7.it"],
  ].map(([source = "", site = ""]) => ({
    source,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(`(benzina OR carburanti OR petrolio OR greggio OR accise) site:${site} when:7d`)}&hl=it&gl=IT&ceid=IT:it`,
  })),
];

const KEYWORDS = /benzin|carburant|petroli|greggio|gasolio|diesel|brent|wti|opec|accise|distribut|raffiner|barile|metano|gpl|pieno|rifornim/i;

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

function findImage(b: string): string | null {
  const m =
    b.match(/<enclosure[^>]+url="([^"]+)"/) ||
    b.match(/<media:content[^>]+url="([^"]+)"/) ||
    b.match(/<media:thumbnail[^>]+url="([^"]+)"/) ||
    b.match(/<img[^>]+src=["']([^"']+)["']/) ||
    b.match(/&lt;img[^&]+src=&quot;([^&]+)&quot;/);
  return m?.[1]?.replace(/&amp;/g, "&") ?? null;
}

async function ogImage(url: string): Promise<string | null> {
  if (url.includes("news.google.com")) return null;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 200000);
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export const getNews = createServerFn({ method: "GET" }).handler(async (): Promise<NewsItem[]> => {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const r = await fetch(f.url, { headers: UA, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return [];
      const xml = await r.text();
      const items: NewsItem[] = [];
      for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
        const b = m[1] ?? "";
        let title = clean(b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
        const link = clean(b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
        const date = clean(b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "");
        if (link.includes("news.google.com")) title = title.replace(/\s+-\s+[^-]+$/, "");
        if (title && link && KEYWORDS.test(title))
          items.push({ title, link, source: f.source, date, image: findImage(b) });
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
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
    .slice(0, 24);
  await Promise.all(
    all.map(async (i) => {
      if (!i.image) i.image = await ogImage(i.link);
    }),
  );
  return all;
});
