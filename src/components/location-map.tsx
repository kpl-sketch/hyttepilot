"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef } from "react";
import type { Position } from "@/lib/position";

/** Et punkt kartet skal flytte seg til, og hvor nært det skal vise det. */
export type MapFocus = Position & { zoom: number };

/** Kartverkets åpne topografiske kart. Gratis, uten nøkkel, CC BY 4.0. */
const TILES = "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png";

/**
 * Lite kart med en nål eieren kan dra til hytta, eller flytte ved å trykke i
 * kartet. Leaflet lastes først i nettleseren, fordi det trenger `window`.
 *
 * `focus` endres bare når posisjonen kommer utenfra (et forslag, telefonen
 * eller en lenke). Da flytter kartet seg dit. Når eieren drar nålen, sier
 * kartet fra med `onMove` og blir stående der det er.
 */
export function LocationMap({
  focus,
  onMove,
}: {
  focus: MapFocus;
  onMove: (position: Position) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const moved = useRef(onMove);
  const latest = useRef(focus);

  useEffect(() => {
    moved.current = onMove;
  }, [onMove]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !element.current || map.current) return;
      const start = latest.current;
      const created = L.map(element.current, {
        center: [start.latitude, start.longitude],
        zoom: start.zoom,
        // Siden skal kunne rulles forbi kartet uten at kartet zoomer.
        scrollWheelZoom: false,
      });
      created.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
      L.tileLayer(TILES, {
        maxZoom: 18,
        attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
      }).addTo(created);
      const pin = L.marker([start.latitude, start.longitude], {
        draggable: true,
        autoPan: true,
        title: "Hytta. Dra nålen for å flytte den.",
        alt: "Nål som viser hvor hytta ligger",
        icon: L.divIcon({
          className: "hytte-nal",
          html: '<span aria-hidden="true"></span>',
          iconSize: [32, 42],
          iconAnchor: [16, 40],
        }),
      }).addTo(created);
      const report = () => {
        const { lat, lng } = pin.getLatLng();
        moved.current({ latitude: lat, longitude: lng });
      };
      pin.on("dragend", report);
      created.on("click", (event) => {
        pin.setLatLng(event.latlng);
        report();
      });
      map.current = created;
      marker.current = pin;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    latest.current = focus;
    const point: [number, number] = [focus.latitude, focus.longitude];
    marker.current?.setLatLng(point);
    map.current?.setView(point, focus.zoom);
  }, [focus]);

  return (
    <div
      ref={element}
      role="application"
      aria-label="Kart over hytta. Dra nålen eller trykk i kartet for å flytte den."
      className="mt-2 h-64 w-full overflow-hidden rounded-xl border border-line bg-paper sm:h-80"
    />
  );
}
