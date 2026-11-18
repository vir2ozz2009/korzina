import type { Schedule } from "../../../src/shared/contracts/slots";

const schedule: Schedule = {
  timeZone: "Asia/Ho_Chi_Minh",
  windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, from: 540, to: 1200 })),
  capacity: 5,
  slotMinutes: 60,
  asap: true,
};

export function seedSchedule(storage: DurableObjectStorage) {
  storage.sql.exec(
    "INSERT INTO settings(key,value) VALUES('collection_schedule',?) ON CONFLICT DO NOTHING",
    JSON.stringify(schedule),
  );
}
