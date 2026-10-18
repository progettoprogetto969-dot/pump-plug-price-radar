import { useEffect, useRef } from "react";
import L from "leaflet";

export type MapPoint = { id: string; lat: number; lng: number; tone: "low" | "mid" | "high" | "ev"; label?: string };

const iconCache = new Map<string, L.DivIcon>();
function pinIcon(tone: MapPoint["tone"], label?: string) {
  const key = tone + (label ?? "");
  let i = iconCache.get(key);
  if (!i) {
    const glyph = tone === "ev" ? "⚡" : "⛽";
    i = L.divIcon({
      className: "",
      html: `<div class="pin pin-${tone}"><span>${glyph}</span>${label ? `<b>${label}</b>` : ""}</div><i class="pin-tip pin-tip-${tone}"></i>`,
      iconSize: [64, 34],
      iconAnchor: [32, 34],
    });
    iconCache.set(key, i);
  }
  return i;
}

export default function MapView({
  points,
  kind,
  onSelect,
}: {
  points: MapPoint[];
  kind: "fuel" | "ev";
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const ready = useRef<Promise<void> | null>(null);
  const cb = useRef(onSelect);
  cb.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView([42.2, 12.6], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(m);
    map.current = m;
    // markercluster is a UMD plugin that patches the global L.
    (window as unknown as { L: typeof L }).L = L;
    ready.current = import("leaflet.markercluster").then(() => undefined);
    return () => {
      m.remove();
      map.current = null;
      cluster.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    ready.current?.then(() => {
      const m = map.current;
      if (cancelled || !m) return;
      if (cluster.current) m.removeLayer(cluster.current);
      const g = L.markerClusterGroup({
        chunkedLoading: true,
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        disableClusteringAtZoom: 16,
        iconCreateFunction: (c) => {
          const n = c.getChildCount();
          const size = n < 50 ? 38 : n < 500 ? 48 : 58;
          return L.divIcon({
            className: "",
            html: `<div class="cluster cluster-${kind}" style="width:${size}px;height:${size}px">${n >= 1000 ? (n / 1000).toFixed(1) + "k" : n}</div>`,
            iconSize: [size, size],
          });
        },
      });
      const markers = points.map((p) =>
        L.marker([p.lat, p.lng], { icon: pinIcon(p.tone, p.label) }).on("click", () => cb.current(p.id)),
      );
      g.addLayers(markers);
      m.addLayer(g);
      cluster.current = g;
    });
    return () => {
      cancelled = true;
    };
  }, [points, kind]);

  return <div ref={el} className="h-full w-full" />;
}
