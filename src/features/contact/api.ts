import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkResponse } from "../../shared/http-error";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";
import { ensureShopSession } from "../../shared/shop-session";

const contactKey = ["shop", shopKey, "contact"] as const;

export function useContact(enabled = true) {
  return useQuery({
    queryKey: contactKey,
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.auth.contact.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}

export function useSavePhone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (phone: string) => {
      await ensureShopSession();
      const response = await shopApi.api.auth.contact.$post(
        { json: { phone, confirmed: true } },
        { headers: commandHeaders() },
      );
      await checkResponse(response);
      return response.json();
    },
    onSuccess: (contact) => {
      const current = client.getQueryData<Contact>(contactKey);
      if (current) client.setQueryData(contactKey, { ...current, ...contact });
      else return client.invalidateQueries({ queryKey: contactKey });
    },
  });
}

export type Contact = NonNullable<ReturnType<typeof useContact>["data"]>;
