import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { shopKey } from "../../shared/shop-api";
import { useSaveReceiving } from "./api";

vi.mock("../../shared/shop-session", () => ({ ensureShopSession: async () => undefined }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("A6 · смена получения в открытой корзине перечитывает цену доставки в обе стороны", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ["shop", shopKey, "cart"];
  let applicable = false;
  let revision = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      applicable = !applicable;
      revision++;
      return Response.json({ revision });
    }),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({
      cart: useQuery({
        queryKey: key,
        queryFn: async () => ({ revision, delivery: { feeMinor: applicable ? 0 : 12000 } }),
      }),
      save: useSaveReceiving(),
    }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.cart.data?.delivery.feeMinor).toBe(12000));
  for (const fee of [0, 12000]) {
    await act(async () => {
      await result.current.save.mutateAsync({ receiving: { mode: "pickup" }, expectedRevision: revision });
    });
    await waitFor(() => expect(result.current.cart.data?.delivery.feeMinor).toBe(fee));
  }
  client.clear();
});
