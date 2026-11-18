import { Hono } from "hono";
import type { ShopEnv } from "../../shop/env";
import { collectionCalendar, parseSchedule } from "./service";

export const slotRoutes = new Hono<ShopEnv>().get("/", (c) => {
  const [row] = c.env.storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='collection_schedule'")
    .toArray();
  const schedule = parseSchedule(row?.value);
  return c.json(schedule ? collectionCalendar(c.env.storage, schedule, Date.now()) : null);
});
