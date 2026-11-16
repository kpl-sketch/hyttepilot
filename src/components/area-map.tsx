"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { AREA_RADIUS_METERS, type Position, outsideNorway } from "@/lib/position";

/** Kartverkets åpne topografiske kart i Norge, OpenStreetMap ellers. Samme som i hytteskjemaet. */
const NORWAY = {
  url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
  attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
};
const ABROAD = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

/**
 * Kart over området hytta ligger i, for lånere før lånet er betalt. Viser en
 * sirkel rundt et grovt punkt, ingen nål. Får aldri den nøyaktige posisjonen.
 */
export function AreaMap({ position, area }: { position: Position; area: string }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;
    void import("leaflet").then((L) => {
      if (cancelled || !element.current) return;
      const center: [number, number] = [position.latitude, position.longitude];
      const map = L.map(element.current, {
        minZoom: 4,
        maxZoom: 13,
        scrollWheelZoom: false,
      });
      // Utsnittet settes før sirkelen tegnes, ellers kan sirkelen bli kuttet.
      map.fitBounds(L.latLng(center).toBounds(AREA_RADIUS_METERS * 2), { padding: [16, 16] });
      map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
      const layer = outsideNorway(position) ? ABROAD : NORWAY;
      L.tileLayer(layer.url, { ...layer, maxZoom: 13 }).addTo(map);
      L.circle(center, {
        radius: AREA_RADIUS_METERS,
        color: "#173f57",
        weight: 2,
        fillOpacity: 0.15,
        interactive: false,
      }).addTo(map);
      remove = () => map.remove();
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [position]);

  return (
    <div
      ref={element}
      role="img"
      aria-label={`Kart over området rundt ${area}. Sirkelen viser omtrent hvor hytta ligger.`}
      className="mt-3 h-56 w-full overflow-hidden rounded-xl border border-line bg-paper sm:h-64"
    />
  );
}
