import { z } from "zod";

const catalogScope = z.string().regex(/^(all|category:.{1,120}|brand:.{1,120})$/);
export type CatalogScope = "all" | `category:${string}` | `brand:${string}`;
export const catalogListInput = z.object({
  scope: catalogScope.default("all"),
  cursor: z.string().min(1).max(1024).optional(),
  version: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});
export type CatalogListInput = z.infer<typeof catalogListInput>;
