import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Cart } from "../../shared/contracts/cart";
import type { AddressCommand } from "../../shared/contracts/profile";
import { checkResponse, errorKind } from "../../shared/http-error";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";
import { clearClientSession } from "../../shared/shop-session";
import { saveCartSnapshot } from "../cart";
import { clearPurchaseSession } from "../checkout";
import type { ReceivingState } from "../receiving";

const profileKey = ["shop", shopKey, "profile"] as const;
const addressKey = [...profileKey, "addresses"] as const;
const retryCommand = (tries: number, error: Error) => tries < 1 && errorKind(error) === "retry";

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: profileKey,
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.profile.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: addressKey,
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.profile.addresses.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}

export function useEditProfile() {
  const client = useQueryClient();
  return useMutation({
    retry: retryCommand,
    mutationFn: async ({ key, ...input }: { key: string; revision: number; name: string; phone: string }) => {
      const response = await shopApi.api.profile.$post({ json: input }, { headers: commandHeaders(key) });
      await checkResponse(response);
      return response.json();
    },
    onSuccess: (profile) => {
      client.setQueryData(profileKey, profile);
      for (const key of ["contact", "receiving", "cart"])
        void client.invalidateQueries({ queryKey: ["shop", shopKey, key] });
    },
  });
}

export function useEditAddress() {
  const client = useQueryClient();
  return useMutation({
    retry: retryCommand,
    mutationFn: async ({ input, key }: { input: AddressCommand; key: string }) => {
      const response = await shopApi.api.profile.addresses.$post({ json: input }, { headers: commandHeaders(key) });
      await checkResponse(response);
      return response.json();
    },
    onSuccess: async ({ revision, addresses, lastUsedAddress }) => {
      const receivingKey = ["shop", shopKey, "receiving"] as const;
      const cartKey = ["shop", shopKey, "cart"] as const;
      await Promise.all([
        client.cancelQueries({ queryKey: receivingKey, exact: true }),
        client.cancelQueries({ queryKey: cartKey, exact: true }),
      ]);
      client.setQueryData(addressKey, { revision, addresses });
      client.setQueryData<ReceivingState>(receivingKey, (current) =>
        current && current.revision <= revision
          ? { ...current, revision, savedAddresses: addresses, lastUsedAddress }
          : current,
      );
      client.setQueryData<Cart>(cartKey, (current) =>
        current && current.revision < revision ? { ...current, revision } : current,
      );
      void client.invalidateQueries({ queryKey: profileKey, exact: true, refetchType: "none" });
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await shopApi.api.auth.logout.$post({ json: {} }, { headers: commandHeaders() });
      await checkResponse(response);
    },
    onSuccess: async () => {
      clearClientSession();
      saveCartSnapshot();
      clearPurchaseSession();
      const keys = [
        "contact",
        "cart",
        "buyer-orders",
        "order",
        "receiving",
        "favorites",
        "profile",
        "quote",
        "purchase-summary",
      ];
      const filters = {
        predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
          queryKey[0] === "shop" && queryKey[1] === shopKey && keys.includes(String(queryKey[2])),
      };
      await Promise.all([client.cancelQueries(filters), client.cancelQueries({ queryKey: ["admin"] })]);
      client.removeQueries(filters);
      client.removeQueries({ queryKey: ["admin"] });
      client.removeQueries({ queryKey: ["chat-photo"] });
      await client.invalidateQueries({ queryKey: ["shop", shopKey] });
    },
  });
}
