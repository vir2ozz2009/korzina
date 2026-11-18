import type { DeliveryTariff, DeliveryZone, Point } from "../../../src/shared/contracts/receiving";

const radians = Math.PI / 180;
const earthRadiusMeters = 6_371_008.8;

function distance(a: Point, b: Point) {
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const chord =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(chord)));
}

function insidePolygon(point: Point, vertices: Point[]) {
  let inside = false;
  const x = point.lon;
  const y = point.lat;
  // Treat points on the boundary as inside. Coordinates describe a local delivery zone.
  const tolerance = 1e-10;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = (x - a.lon) * (b.lat - a.lat) - (y - a.lat) * (b.lon - a.lon);
    if (
      Math.abs(cross) <= tolerance &&
      x >= Math.min(a.lon, b.lon) - tolerance &&
      x <= Math.max(a.lon, b.lon) + tolerance &&
      y >= Math.min(a.lat, b.lat) - tolerance &&
      y <= Math.max(a.lat, b.lat) + tolerance
    )
      return true;
    if (a.lat > y !== b.lat > y && x < ((b.lon - a.lon) * (y - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

function tariffCost(tariff: DeliveryTariff) {
  if (tariff.kind === "free") return 0;
  return tariff.kind === "fixed" ? tariff.feeMinor : Number.POSITIVE_INFINITY;
}

export function deliveryZone(zones: DeliveryZone[], point: Point) {
  let best: DeliveryZone | undefined;
  for (const zone of zones) {
    const { geometry } = zone;
    const inside =
      geometry.type === "radius"
        ? distance(geometry.center, point) <= geometry.radiusMeters + 0.001
        : insidePolygon(point, geometry.points);
    if (inside && (!best || tariffCost(zone.tariff) < tariffCost(best.tariff))) best = zone;
  }
  return best;
}
