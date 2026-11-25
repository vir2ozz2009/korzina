import { z } from "zod";
import { salesPeriod } from "./seller-sales";

const method = z.enum(["cash", "transfer", "unknown"]);
export const moneyKind = z.enum(["received", "returned"]);
export const moneyGroup = z.enum(["review", "topUp", "refund"]);

export const moneyPeriod = salesPeriod
  .partial()
  .extend({ rev: z.coerce.number().int().nonnegative().optional(), cachedDay: z.iso.date().optional() })
  .refine(({ from, to }) => (!from && !to) || (!!from && !!to && from <= to), "Укажите период");

export const moneyOperationsQuery = z.intersection(
  moneyPeriod,
  z.object({
    kind: moneyKind.optional(),
    method: method.optional(),
    search: z.string().trim().max(40).optional(),
    cursor: z.string().max(400).optional(),
  }),
);
export const moneyTasksQuery = z.object({
  group: moneyGroup,
  cursor: z.string().max(250).optional(),
});

export type SellerMoneyTask = {
  id: string;
  kind: z.infer<typeof moneyGroup>;
  number: number;
  amountMinor: number;
  at: number;
  needsSeller: boolean;
  detailsReady: boolean;
};

export type SellerMoneyOverview = {
  revision: number;
  currency: string;
  timeZone: string;
  period: z.infer<typeof salesPeriod>;
  receivedMinor: number | null;
  returnedMinor: number | null;
  receivedIncomplete: boolean;
  returnedIncomplete: boolean;
  counts: Record<SellerMoneyTask["kind"], number>;
  methods: { method: z.infer<typeof method>; amountMinor: number }[];
};

export type SellerMoneyOperation = {
  id: number;
  number: number;
  kind: z.infer<typeof moneyKind>;
  amountMinor: number | null;
  at: number;
  method: z.infer<typeof method> | null;
};

export type SellerMoneyPage<T> = { rows: T[]; revision: number; currency: string; cursor?: string };
