import type { FulfillmentSettings } from "../../../src/shared/contracts/receiving";
import { type Schedule, weekdays } from "../../../src/shared/contracts/receiving-time";

const fulfillment: FulfillmentSettings = {
  delivery: {
    mode: "map",
    payee: "shop",
    zones: [
      {
        id: "center",
        geometry: { type: "radius", center: { lat: 10.7769, lon: 106.7009 }, radiusMeters: 6000 },
        tariff: { kind: "fixed", feeMinor: 25000 },
      },
    ],
  },
  pickup: { address: "45 Le Loi, Ho Chi Minh City", hours: "Ежедневно 09:00–20:00" },
  requiredDetails: ["apartment"],
  acceptingOrders: true,
};

export function seedFulfillment(storage: DurableObjectStorage) {
  storage.sql.exec(
    "INSERT INTO settings(key,value) VALUES('fulfillment',?) ON CONFLICT DO NOTHING",
    JSON.stringify(fulfillment),
  );
  const delivery = [
    { start: "10:00", end: "12:00", capacity: 4 },
    { start: "14:00", end: "16:00", capacity: 4 },
  ];
  const pickup = [{ start: "09:00", end: "20:00", capacity: 4 }];
  const schedule: Schedule = {
    timeZone: "Asia/Ho_Chi_Minh",
    delivery: {
      mode: "slots",
      days: Object.fromEntries(weekdays.map((day) => [day, delivery])),
      preparationMinutes: 60,
      dayCutoff: "18:00",
    },
    pickup: {
      mode: "slots",
      days: Object.fromEntries(weekdays.map((day) => [day, pickup])),
      preparationMinutes: 60,
      dayCutoff: "18:00",
    },
  };
  storage.sql.exec(
    "INSERT INTO settings(key,value) VALUES('receiving_schedule',?) ON CONFLICT DO NOTHING",
    JSON.stringify(schedule),
  );
  storage.sql.exec(
    "INSERT INTO settings(key,value) VALUES('purchase_payment',?) ON CONFLICT DO NOTHING",
    JSON.stringify({
      minimumMinor: 120000,
      methods: ["cash", "transfer"],
      instruction: "Демо-перевод. Не отправляйте деньги.",
    }),
  );
}
