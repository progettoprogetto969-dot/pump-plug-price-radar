import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { Fuel, Zap, X, Navigation, Loader2, Newspaper } from "lucide-react";
import { getChargers, getEvMode, getFuelStations, getStation, type Bounds, type FuelKey } from "@/lib/data.functions";
import { InstallButton } from "@/components/InstallButton";
import { NewsPanel } from "@/components/NewsPanel";
import type { MapPoint } from "@/components/MapView";

const MapView = lazy(() => import("@/components/MapView"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Carburanti Live — Prezzi benzina e colonnine elettriche" },
      { name: "description", content: "Mappa dei prezzi carburanti MIMIT, colonnine di ricarica e news quotidiane su benzina e petrolio." },
      { property: "og:title", content: "Carburanti Live — Prezzi benzina e colonnine" },
      { property: "og:description", content: "Prezzi carburanti in tempo reale, colonnine elettriche e news sul petrolio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FUELS: { key: FuelKey; label: string }[] = [
  { key: "benzina", label: "Benzina" },
  { key: "diesel", label: "Diesel" },
  { key: "gpl", label: "GPL" },
  { key: "metano", label: "Metano" },
];

const dir = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

function Index() {
  const [mode, setMode] = useState<"fuel" | "ev">("fuel");
  const [fuel, setFuel] = useState<FuelKey>("benzina");
  const [view, setView] = useState<{ b: Bounds; z: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const evMode = useQuery({ queryKey: ["evmode"], queryFn: () => getEvMode(), staleTime: Infinity });
  const nationwide = evMode.data?.nationwide ?? false;
  const evNeedsZoom = !nationwide && (!view || view.z < 10);
  const tooFar = mode === "ev" && evNeedsZoom;

  const fuelQ = useQuery({
    queryKey: ["fuel", fuel],
    queryFn: () => getFuelStations({ data: { fuel } }),
    enabled: mode === "fuel",
    staleTime: 30 * 60 * 1000,
  });
  const evQ = useQuery({
    queryKey: ["ev", nationwide ? "all" : view?.b],
    queryFn: () => getChargers({ data: nationwide ? {} : { bounds: view!.b } }),
    enabled: mode === "ev" && evMode.isSuccess && !evNeedsZoom,
    placeholderData: keepPreviousData,
    staleTime: 30 * 60 * 1000,
  });

  const { points, thresholds } = useMemo(() => {
    if (mode === "ev") {
      return { points: (evQ.data?.list ?? []).map((c): MapPoint => ({ id: c.id, lat: c.lat, lng: c.lng, tone: "ev" })), thresholds: null };
    }
    const list = fuelQ.data ?? [];
    const sorted = list.map((s) => s.best).sort((a, b) => a - b);
    const t1 = sorted[Math.floor(sorted.length / 3)] ?? 0;
    const t2 = sorted[Math.floor((sorted.length * 2) / 3)] ?? 0;
    return {
      thresholds: sorted.length ? { t1, t2 } : null,
      points: list.map((s): MapPoint => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        tone: s.best < t1 ? "low" : s.best < t2 ? "mid" : "high",
      })),
    };
  }, [mode, fuelQ.data, evQ.data]);

  const stationQ = useQuery({
    queryKey: ["station", sel],
    queryFn: () => getStation({ data: { id: sel! } }),
    enabled: mode === "fuel" && !!sel,
  });
  const station = mode === "fuel" && sel ? stationQ.data ?? undefined : undefined;
  const charger = mode === "ev" ? evQ.data?.list.find((c) => c.id === sel) : undefined;
  const loading = mode === "fuel" ? fuelQ.isFetching : evQ.isFetching;
  const error = mode === "fuel" ? fuelQ.error : evQ.error;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-3">
        <img src="/icon-192.png" alt="" width={36} height={36} className="rounded-lg" />
        <h1 className="font-display text-xl font-bold leading-none">Carburanti<span className="text-primary">Live</span></h1>
        <div className="ml-auto flex items-center gap-2">
          <a href="#notizie" className="chip flex items-center gap-1.5"><Newspaper className="h-4 w-4" /> Notizie</a>
          <InstallButton />
        </div>
      </header>

      <div className="flex flex-col gap-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button className="mode-btn" data-active={mode === "fuel"} onClick={() => { setMode("fuel"); setSel(null); }}>
            <Fuel className="h-6 w-6" /> Pompe di benzina
          </button>
          <button className="mode-btn" data-active={mode === "ev"} onClick={() => { setMode("ev"); setSel(null); }}>
            <Zap className="h-6 w-6" /> Colonnine elettriche
          </button>
        </div>
        {mode === "fuel" && (
          <div className="flex flex-wrap items-center gap-2">
            {FUELS.map((f) => (
              <button key={f.key} className="chip" data-active={fuel === f.key} onClick={() => { setFuel(f.key); setSel(null); }}>
                {f.label}
              </button>
            ))}
            {thresholds && (
              <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><i className="dot dot-low" />≤ {thresholds.t1.toFixed(3)}</span>
                <span className="flex items-center gap-1"><i className="dot dot-mid" />medio</span>
                <span className="flex items-center gap-1"><i className="dot dot-high" />≥ {thresholds.t2.toFixed(3)} €/l</span>
              </div>
            )}
          </div>
        )}
      </div>

      <main className="relative h-[75dvh] overflow-hidden border-y border-border">
        <ClientOnly fallback={<div className="h-full w-full bg-muted" />}>
          <Suspense fallback={<div className="h-full w-full bg-muted" />}>
            <MapView points={tooFar ? [] : points} onBounds={(b, z) => setView({ b, z })} onSelect={setSel} />
          </Suspense>
        </ClientOnly>

        <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2">
          {tooFar ? (
            <div className="status-pill">Avvicina la mappa per vedere le colonnine</div>
          ) : loading ? (
            <div className="status-pill"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
          ) : error ? (
            <div className="status-pill text-destructive">{(error as Error).message}</div>
          ) : (
            <div className="status-pill">{points.length.toLocaleString("it-IT")} {mode === "fuel" ? "distributori in Italia" : nationwide ? "colonnine in Italia" : "colonnine in zona"}</div>
          )}
        </div>

        {mode === "fuel" && sel && stationQ.isFetching && (
          <aside className="detail-panel"><Loader2 className="h-5 w-5 animate-spin" /></aside>
        )}
        {(station || charger) && (
          <aside className="detail-panel">
            <button className="absolute right-3 top-3 text-muted-foreground" onClick={() => setSel(null)} aria-label="Chiudi">
              <X className="h-5 w-5" />
            </button>
            {station && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{station.brand}</p>
                <h3 className="font-display pr-8 text-lg font-bold">{station.name}</h3>
                <p className="text-sm text-muted-foreground">{station.address} — {station.city}</p>
                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {station.prices.map((p, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="py-1.5">{p.fuel}</td>
                        <td className="text-xs text-muted-foreground">{p.self ? "Self" : "Servito"}</td>
                        <td className="text-right font-mono font-bold">{p.price.toFixed(3)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-muted-foreground">Ultimo aggiornamento: {station.prices[0]?.date} · Fonte MIMIT</p>
                <a className="btn-directions" href={dir(station.lat, station.lng)} target="_blank" rel="noreferrer">
                  <Navigation className="h-4 w-4" /> Indicazioni stradali
                </a>
              </>
            )}
            {charger && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-ev">{charger.operator}</p>
                <h3 className="font-display pr-8 text-lg font-bold">{charger.name}</h3>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Prese</dt><dd>{charger.sockets}</dd>
                  <dt className="text-muted-foreground">Punti</dt><dd>{charger.capacity}</dd>
                  <dt className="text-muted-foreground">Potenza</dt><dd>{charger.power}</dd>
                </dl>
                <a className="btn-directions" href={dir(charger.lat, charger.lng)} target="_blank" rel="noreferrer">
                  <Navigation className="h-4 w-4" /> Indicazioni stradali
                </a>
              </>
            )}
          </aside>
        )}
      </main>
      <NewsPanel />
    </div>
  );
}
