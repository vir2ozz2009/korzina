import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { offerPages, offersQuery } from "./offers";

it("новая страница live не перечитывает уже загруженную и каждый запрос ограничен 50 SKU", async () => {
  const client = new QueryClient();
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ items: [] }));
  try {
    const first = { items: [{ variants: Array.from({ length: 60 }, (_, i) => ({ id: `sku-${i}` })) }] };
    const second = { items: [{ variants: [{ id: "next-sku" }] }] };
    for (const ids of offerPages([first])) await client.fetchQuery(offersQuery(ids));
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const ids of offerPages([first, second])) await client.fetchQuery(offersQuery(ids));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(offerPages([first, second]).map((page) => page.length)).toEqual([50, 10, 1]);
  } finally {
    client.clear();
    fetcher.mockRestore();
  }
});
