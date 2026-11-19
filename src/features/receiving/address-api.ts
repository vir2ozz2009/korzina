import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { GeocodeInput, Point } from "../../shared/contracts/receiving";
import { checkResponse, HttpError } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";
import { ensureShopSession } from "../../shared/shop-session";

const addressKey = ["shop", shopKey, "address"] as const;

async function geocode(input: GeocodeInput, signal: AbortSignal) {
  await ensureShopSession();
  const response = await shopApi.api.receiving.geocode.$post({ json: input }, { init: { signal } });
  if (!response.ok && response.status === 404) {
    try {
      await checkResponse(response);
    } catch (error) {
      if (error instanceof HttpError && error.code === "ADDRESS_NOT_FOUND") return [];
      throw error;
    }
  }
  await checkResponse(response);
  return (await response.json()).results;
}

export function useAddressSuggestions(text: string) {
  const address = text.trim();
  const [settled, setSettled] = useState("");
  useEffect(() => {
    if (address.length < 3) return;
    const delay = setTimeout(() => setSettled(address), 1150);
    return () => clearTimeout(delay);
  }, [address]);
  const ready = address.length >= 3 && settled === address;
  const query = useQuery({
    queryKey: [...addressKey, "search", ready ? settled : ""],
    enabled: ready,
    retry: false,
    staleTime: 30_000,
    gcTime: 30_000,
    queryFn: ({ signal }) => geocode({ type: "search", address: settled }, signal),
  });
  return { query, searching: address.length >= 3 && (!ready || query.isFetching) };
}

export function usePointName(point: Point | undefined) {
  return useQuery({
    queryKey: [...addressKey, "reverse", point],
    enabled: !!point,
    retry: false,
    staleTime: 30_000,
    queryFn: ({ signal }) => {
      if (!point) return [];
      return geocode({ type: "reverse", point }, signal);
    },
  });
}

export function usePointDelivery(point: Point | undefined) {
  return useQuery({
    queryKey: [...addressKey, "delivery", point],
    enabled: !!point,
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      if (!point) return null;
      // The zone endpoint checks coordinates. The order will use the buyer's address.
      const response = await shopApi.api.receiving.check.$post(
        { json: { mode: "delivery", address: "Точка на карте", point } },
        { init: { signal } },
      );
      await checkResponse(response);
      return response.json();
    },
  });
}
