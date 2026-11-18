import "leaflet/dist/leaflet.css";
import { divIcon, type Map as LeafletMap, type Marker, map, marker, tileLayer } from "leaflet";
import { useEffect, useRef } from "react";
import type { Point } from "../../../shared/contracts/receiving";

export function AddressMap({
  point,
  select,
  onUnavailable,
}: {
  point?: Point;
  select: (point: Point) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLElement>(null);
  const mapRef = useRef<LeafletMap>(null);
  const pin = useRef<Marker>(null);
  const callbacks = useRef({ select, onUnavailable });
  callbacks.current = { select, onUnavailable };
  useEffect(() => {
    if (!container.current) return;
    const current = map(container.current, { zoomControl: false, scrollWheelZoom: false }).setView(
      [10.7769, 106.7009],
      13,
    );
    mapRef.current = current;
    const tiles = tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    });
    tiles.once("tileerror", () => callbacks.current.onUnavailable());
    tiles.addTo(current);
    current.on("click", ({ latlng }) => callbacks.current.select({ lat: latlng.lat, lon: latlng.lng }));
    return () => {
      current.remove();
      mapRef.current = null;
      pin.current = null;
    };
  }, []);
  useEffect(() => {
    const current = mapRef.current;
    if (!current) return;
    pin.current?.remove();
    if (!point) return;
    const location = [point.lat, point.lon] as const;
    const next = marker([...location], {
      draggable: true,
      icon: divIcon({
        className: "",
        html: '<span class="block size-5 rounded-full border-2 border-white bg-primary shadow-float"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    });
    next.on("dragend", () => {
      const value = next.getLatLng();
      callbacks.current.select({ lat: value.lat, lon: value.lng });
    });
    pin.current = next.addTo(current);
    current.panTo([...location]);
  }, [point]);
  return (
    <section
      ref={container}
      className="relative isolate z-0 h-44 overflow-hidden rounded-xl bg-input"
      aria-label="Карта доставки"
    />
  );
}
