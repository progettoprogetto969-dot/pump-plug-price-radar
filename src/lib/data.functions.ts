import { createServerFn } from "@tanstack/react-start";
import { MIMIT_ANAGRAFICA, MIMIT_PREZZI, parseMimit, type FuelStation } from "./mimit";

export type Bounds = { s: number; w: number; n: number; e: number };
export type { FuelKey, FuelStation } from "./mimit";

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

export type NewsItem = { title: string; link: string; source: string; date: string; image: string };

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CarburantiLive/1.0", Accept: "*/*" };
let cache: { at: number; stations: FuelStation[] } | null = null;

async function fetchText(url: string) {
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.text();
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

function parseBounds(d: unknown): Bounds {
  const b = d as Bounds;
  for (const k of ["s", "w", "n", "e"] as const) {
    if (typeof b?.[k] !== "number" || !isFinite(b[k])) throw new Error("bounds non validi");
  }
  return b;
}

/** Whole national MIMIT dataset. Never throws: returns ok:false so the browser can try its own fallback. */
export const getFuelStations = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ok: true; stations: FuelStation[] } | { ok: false; error: string }> => {
    try {
      if (!cache || Date.now() - cache.at > 60 * 60 * 1000) {
        const [ana, pr] = await Promise.all([fetchText(MIMIT_ANAGRAFICA), fetchText(MIMIT_PREZZI)]);
        const stations = parseMimit(ana, pr);
        if (!stations.length) throw new Error("file vuoto");
        cache = { at: Date.now(), stations };
      }
      return { ok: true, stations: cache.stations };
    } catch (e) {
      console.error("MIMIT fetch failed", e);
      return { ok: false, error: "Il server del MIMIT non risponde" };
    }
  },
);

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
