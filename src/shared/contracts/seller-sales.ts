import { z } from "zod";

export const salesPeriod = z.object({ from: z.iso.date(), to: z.iso.date() });
export type SalesPeriod = z.infer<typeof salesPeriod>;

export const salesSearch = z
  .object({ from: z.iso.date().optional(), to: z.iso.date().optional(), compare: z.literal("0").optional() })
  .refine(({ from, to }) => (!from && !to) || (!!from && !!to && from <= to), "Укажите начало и конец периода");

const amount = z.int().nonnegative();
const totals = z.object({
  revenueMinor: amount.nullable(),
  orderCount: amount,
  positiveOrders: amount,
  averageMinor: z.number().nonnegative().nullable(),
  incomplete: z.boolean(),
});
export const salesSummary = z.object({
  period: salesPeriod,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  revenueMinor: amount.nullable(),
  incomplete: z.boolean(),
});
const point = totals.extend({ from: z.string(), to: z.string() });
export const salesReport = z.object({
  period: salesPeriod,
  currency: salesSummary.shape.currency,
  timeZone: z.string(),
  unit: z.enum(["hour", "day", "week", "month"]),
  current: totals,
  previous: totals.nullable(),
  changes: z
    .object({
      revenueMinor: z.number().nullable(),
      orderCount: z.number().nullable(),
      average: z.number().nullable(),
    })
    .nullable(),
  revenueDifference: z.int().nullable(),
  points: z.array(point),
  previousPoints: z.array(point),
});
export const salesDays = z.object({ currency: salesSummary.shape.currency, rows: z.array(point) });
export type SalesReport = z.infer<typeof salesReport>;
export type SalesTotals = z.infer<typeof totals>;

export const salesRank = z.object({
  period: salesPeriod,
  rows: z.array(z.object({ id: z.string(), name: z.string(), quantity: amount, share: z.number() })),
  next: z.string().optional(),
});
export type SalesRank = z.infer<typeof salesRank>;
export const productSales = z.object({
  period: salesPeriod,
  currency: salesSummary.shape.currency,
  name: z.string(),
  variants: z.array(z.object({ id: z.string(), unit: z.string(), archived: z.boolean() })),
  quantity: amount,
  orderCount: amount,
  revenueMinor: amount,
  incomplete: z.boolean(),
  archived: z.boolean(),
  canOpenProduct: z.boolean().optional().default(false),
  timeZone: z.string(),
});
