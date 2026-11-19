import "leaflet/dist/leaflet.css";
import { divIcon, type Map as LeafletMap, type Marker, map, marker, tileLayer } from "leaflet";
import { useEffect, useRef } from "react";
import type { Point } from "../../../shared/contracts/receiving";

export function AddressMap({
  center,
  point,
  select,
  onUnavailable,
}: {
  center?: Point;
  point?: Point;
  select: (point: Point) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLElement>(null);
  const initialCenter = useRef(center);
  const mapRef = useRef<LeafletMap>(null);
  const pin = useRef<Marker>(null);
  const callbacks = useRef({ select, onUnavailable });
  callbacks.current = { select, onUnavailable };
  useEffect(() => {
    if (!container.current) return;
    const start = initialCenter.current;
    const current = map(container.current, { scrollWheelZoom: false, minZoom: 2, worldCopyJump: true }).setView(
      start ? [start.lat, start.lon] : [0, 0],
      start ? 16 : 2,
    );
    mapRef.current = current;
    const tiles = tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    });
    tiles.once("tileerror", () => callbacks.current.onUnavailable());
    tiles.addTo(current);
    current.on("click", ({ latlng }) => {
      const { lat, lng } = latlng.wrap();
      callbacks.current.select({ lat, lon: lng });
    });
    const resize = new ResizeObserver(() => current.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      current.remove();
      mapRef.current = null;
      pin.current = null;
    };
  }, []);
  useEffect(() => {
    if (center) mapRef.current?.setView([center.lat, center.lon], 16);
  }, [center]);
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
      const value = next.getLatLng().wrap();
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
