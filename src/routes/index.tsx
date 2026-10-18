import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { Fuel, Zap, X, Navigation, Loader2, Newspaper, RotateCw } from "lucide-react";
import { getChargers, getFuelStations } from "@/lib/data.functions";
import { MIMIT_ANAGRAFICA, MIMIT_PREZZI, bestPrice, parseMimit, type FuelKey, type FuelStation } from "@/lib/mimit";
import { InstallButton } from "@/components/InstallButton";
import { NewsPanel } from "@/components/NewsPanel";
import type { MapPoint } from "@/components/MapView";

const MapView = lazy(() => import("@/components/MapView"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Carburanti Live — Prezzi benzina e colonnine elettriche" },
      { name: "description", content: "Mappa nazionale dei prezzi carburanti MIMIT, colonnine di ricarica e news quotidiane su benzina e petrolio." },
      { property: "og:title", content: "Carburanti Live — Prezzi benzina e colonnine" },
      { property: "og:description", content: "Prezzi carburanti in tutta Italia, colonnine elettriche e news sul petrolio." },
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

/** Server first; if the ministry blocks the server, try straight from the visitor's browser. */
async function loadStations(): Promise<FuelStation[]> {
  const res = await getFuelStations();
  if (res.ok) return res.stations;
  try {
    const [a, p] = await Promise.all([
      fetch(MIMIT_ANAGRAFICA).then((r) => r.text()),
      fetch(MIMIT_PREZZI).then((r) => r.text()),
    ]);
    const list = parseMimit(a, p);
    if (list.length) return list;
  } catch {
    /* fall through */
  }
  throw new Error("I dati del MIMIT non sono raggiungibili in questo momento");
}

function Index() {
  const [mode, setMode] = useState<"fuel" | "ev">("fuel");
  const [fuel, setFuel] = useState<FuelKey>("benzina");
  const [sel, setSel] = useState<string | null>(null);

  const fuelQ = useQuery({
    queryKey: ["mimit"],
    queryFn: loadStations,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const evQ = useQuery({
    queryKey: ["ev"],
    queryFn: () => getChargers({ data: {} }),
    enabled: mode === "ev",
    staleTime: 60 * 60 * 1000,
  });

  const { points, thresholds } = useMemo(() => {
    if (mode === "ev") {
      return {
        points: (evQ.data?.list ?? []).map((c): MapPoint => ({ id: c.id, lat: c.lat, lng: c.lng, tone: "ev" })),
        thresholds: null,
      };
    }
    const rows = (fuelQ.data ?? [])
      .map((s) => ({ s, best: bestPrice(s, fuel) }))
      .filter((r): r is { s: FuelStation; best: number } => r.best !== null);
    const sorted = rows.map((r) => r.best).sort((a, b) => a - b);
    const t1 = sorted[Math.floor(sorted.length / 3)] ?? 0;
    const t2 = sorted[Math.floor((sorted.length * 2) / 3)] ?? 0;
    return {
      thresholds: sorted.length ? { t1, t2 } : null,
      points: rows.map(({ s, best }): MapPoint => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        tone: best < t1 ? "low" : best < t2 ? "mid" : "high",
        label: best.toFixed(3),
      })),
    };
  }, [mode, fuel, fuelQ.data, evQ.data]);

  const station = mode === "fuel" ? fuelQ.data?.find((s) => s.id === sel) : undefined;
  const charger = mode === "ev" ? evQ.data?.list.find((c) => c.id === sel) : undefined;
  const q = mode === "fuel" ? fuelQ : evQ;

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
            <MapView points={points} kind={mode} onSelect={setSel} />
          </Suspense>
        </ClientOnly>

        <div className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2">
          {q.isFetching ? (
            <div className="status-pill"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento dati nazionali…</div>
          ) : q.error ? (
            <div className="status-pill text-destructive">
              {(q.error as Error).message}
              <button className="ml-2 flex items-center gap-1 text-primary" onClick={() => q.refetch()}>
                <RotateCw className="h-3.5 w-3.5" /> Riprova
              </button>
            </div>
          ) : (
            <div className="status-pill">
              {points.length.toLocaleString("it-IT")} {mode === "fuel" ? "distributori in Italia" : "colonnine in Italia"}
            </div>
          )}
        </div>

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
