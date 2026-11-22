import { z } from "zod";

export const workdayStages = ["placed", "accepted", "ready", "handed"] as const;
export const workdayActions = ["accept", "receipt", "payment", "overdue"] as const;
export const workdayFocus = z.enum([...workdayStages, ...workdayActions, "debt"]);
export type WorkdayFocus = z.infer<typeof workdayFocus>;
export const workdayDay = z.object({ day: z.iso.date().optional(), version: z.string().max(250).optional() });
export const workdayMonth = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .optional(),
});
export type SellerWorkday = {
  rev: number;
  version: string;
  day: string;
  timeZone: string;
  count: number;
  totalMinor?: number;
  currency?: string;
  debtMinor?: number;
  stages: Record<(typeof workdayStages)[number], number>;
  actions: Partial<Record<(typeof workdayActions)[number], number>>;
  upcoming?: { window: string; count: number };
};
export type SellerPackingOrder = { number: number; name: string | null; quantity: number; window?: string };
export type SellerPackingRow = {
  productId: string;
  variantId: string;
  name: string;
  variant: string;
  quantity: number;
  orders: SellerPackingOrder[];
};
export type SellerPackingList = {
  rev: number;
  day: string;
  today: string;
  hasTimes: boolean;
  windows: { id: string; passed: boolean; count: number; rows: SellerPackingRow[] }[];
};
export type SellerOrderCalendar = {
  rev: number;
  month: string;
  today: string;
  counts: Record<string, number>;
};
