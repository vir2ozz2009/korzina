import type { FulfillmentSettings } from "../../../src/shared/contracts/receiving";

const fulfillment: FulfillmentSettings = {
  delivery: {
    zones: [
      {
        id: "center",
        geometry: { type: "radius", center: { lat: 10.7769, lon: 106.7009 }, radiusMeters: 6000 },
        tariff: { kind: "fixed", feeMinor: 25000 },
      },
    ],
  },
  pickup: { address: "45 Le Loi, Ho Chi Minh City", hours: "Ежедневно 09:00–20:00" },
};

export function seedFulfillment(storage: DurableObjectStorage) {
  storage.sql.exec(
    "INSERT INTO settings(key,value) VALUES('fulfillment',?) ON CONFLICT DO NOTHING",
    JSON.stringify(fulfillment),
  );
}
