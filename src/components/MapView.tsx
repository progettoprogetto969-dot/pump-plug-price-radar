import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Bounds } from "@/lib/data.functions";

export type MapPoint = { id: string; lat: number; lng: number; tone: "low" | "mid" | "high" | "ev" };

const TONE_VAR = { low: "--price-low", mid: "--price-mid", high: "--price-high", ev: "--ev" } as const;

export default function MapView({
  points,
  onBounds,
  onSelect,
}: {
  points: MapPoint[];
  onBounds: (b: Bounds, zoom: number) => void;
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onBounds, onSelect });
  cb.current = { onBounds, onSelect };

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { preferCanvas: true }).setView([42.2, 12.6], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    let t: ReturnType<typeof setTimeout>;
    const emit = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const b = m.getBounds();
        cb.current.onBounds({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }, m.getZoom());
      }, 400);
    };
    const resize = () => {
      const z = m.getZoom();
      const r = z <= 7 ? 2.5 : z <= 10 ? 4 : z <= 13 ? 7 : 9;
      layer.current?.eachLayer((l) => (l as L.CircleMarker).setRadius(r));
    };
    m.on("moveend", emit);
    m.on("zoomend", resize);
    emit();
    return () => {
      m.remove();
    };
  }, []);

  useEffect(() => {
    const g = layer.current;
    const m = map.current;
    if (!g || !m || !el.current) return;
    g.clearLayers();
    const css = getComputedStyle(el.current);
    const colors = Object.fromEntries(
      Object.entries(TONE_VAR).map(([k, v]) => [k, css.getPropertyValue(v).trim() || "orange"]),
    ) as Record<MapPoint["tone"], string>;
    const z = m.getZoom();
    const radius = z <= 7 ? 2.5 : z <= 10 ? 4 : z <= 13 ? 7 : 9;
    for (const p of points) {
      L.circleMarker([p.lat, p.lng], {
        radius,
        fillColor: colors[p.tone],
        fillOpacity: 0.9,
        color: "#111",
        weight: 1,
      })
        .on("click", () => cb.current.onSelect(p.id))
        .addTo(g);
    }
  }, [points]);

  return <div ref={el} className="h-full w-full" />;
}
