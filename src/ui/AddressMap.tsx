import "leaflet/dist/leaflet.css";
import { circle, divIcon, type Map as LeafletMap, type Marker, map, marker, polygon, tileLayer } from "leaflet";
import { useEffect, useRef } from "react";
import type { DeliveryZone, Point } from "../shared/contracts/receiving";

export function AddressMap({
  center,
  point,
  geometry,
  moveVertex,
  select,
  onUnavailable,
}: {
  center?: Point;
  point?: Point;
  geometry?: DeliveryZone["geometry"];
  moveVertex?: (index: number, point: Point) => void;
  select: (point: Point) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLElement>(null);
  const initialCenter = useRef(center);
  const mapRef = useRef<LeafletMap>(null);
  const pin = useRef<Marker>(null);
  const callbacks = useRef({ select, onUnavailable, moveVertex });
  callbacks.current = { select, onUnavailable, moveVertex };
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
    if (!current || !geometry) return;
    const layer =
      geometry.type === "radius"
        ? circle([geometry.center.lat, geometry.center.lon], { radius: geometry.radiusMeters, interactive: false })
        : polygon(
            geometry.points.map(({ lat, lon }): [number, number] => [lat, lon]),
            { interactive: false },
          );
    layer.addTo(current);
    const handles =
      geometry.type === "polygon" && callbacks.current.moveVertex
        ? geometry.points.map(({ lat, lon }, index) => {
            const handle = marker([lat, lon], {
              draggable: true,
              keyboard: false,
              icon: divIcon({ className: "size-3 rounded-full border-2 border-white bg-primary", iconSize: [12, 12] }),
            }).addTo(current);
            handle.on("dragend", () => {
              const value = handle.getLatLng().wrap();
              callbacks.current.moveVertex?.(index, { lat: value.lat, lon: value.lng });
            });
            return handle;
          })
        : [];
    return () => {
      layer.remove();
      for (const handle of handles) handle.remove();
    };
  }, [geometry]);
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
