import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Bounds } from "@/lib/data.functions";

export type MapPoint = { id: string; lat: number; lng: number; tone: "low" | "mid" | "high" | "ev"; label?: string };

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
    const m = L.map(el.current, { zoomControl: true }).setView([41.9028, 12.4964], 13);
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
        cb.current.onBounds(
          { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() },
          m.getZoom(),
        );
      }, 400);
    };
    m.on("moveend", emit);
    emit();
    navigator.geolocation?.getCurrentPosition(
      (p) => m.setView([p.coords.latitude, p.coords.longitude], 14),
      () => {},
      { timeout: 8000 },
    );
    return () => {
      m.remove();
    };
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const p of points) {
      const icon = L.divIcon({
        className: "",
        html: `<div class="pin pin-${p.tone}">${p.tone === "ev" ? "⚡" : (p.label ?? "⛽")}</div>`,
        iconSize: [52, 26],
        iconAnchor: [26, 26],
      });
      L.marker([p.lat, p.lng], { icon })
        .on("click", () => cb.current.onSelect(p.id))
        .addTo(g);
    }
  }, [points]);

  return <div ref={el} className="h-full w-full" />;
}
