import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useToast } from "../../app/shell/ToastProvider";
import { checkResponse, errorKind } from "../../shared/http-error";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";
import { hasBuyerMarker } from "../../shared/shop-session";
import { useContact } from "../contact";

const storageKey = `korzina:${shopKey}:favorites`;
const idsKey = ["shop", shopKey, "favorites", "ids"] as const;

function localIds(): string[] {
  try {
    const contents: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(contents) ? contents.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function useFavoriteState() {
  const contact = useContact(false);
  const signedIn = !!(contact.data?.phone || contact.data?.telegramLinked || (!contact.data && hasBuyerMarker()));
  const [local, setLocal] = useState(localIds);
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: idsKey,
    enabled: signedIn,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.favorites.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
  const ids = signedIn ? [...new Set([...local, ...(query.data?.ids ?? [])])] : local;
  const store = (next: string[]) => {
    setLocal(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* The list stays available in this tab. */
    }
  };
  const {
    mutate: merge,
    isError: mergeFailed,
    isPending: merging,
    reset: resetMerge,
  } = useMutation({
    scope: { id: storageKey },
    mutationFn: async (batch: string[]) => {
      const response = await shopApi.api.favorites.merge.$post({ json: { ids: batch } }, { headers: commandHeaders() });
      await checkResponse(response);
      return response.json();
    },
    onSuccess: (result, sent) => {
      client.setQueryData(idsKey, result);
      store(localIds().filter((id) => !sent.includes(id)));
    },
  });
  useEffect(() => {
    if (signedIn && query.isSuccess && local.length && !merging && !mergeFailed) merge(local.slice(0, 120));
  }, [signedIn, query.isSuccess, local, merging, mergeFailed, merge]);

  const change = useMutation({
    scope: { id: storageKey },
    retry: (tries, error) => tries < 1 && errorKind(error) === "retry",
    mutationFn: async (input: { productId: string; selected: boolean; key: string }) => {
      const response = await shopApi.api.favorites.$post(
        { json: { productId: input.productId, selected: input.selected } },
        { headers: commandHeaders(input.key) },
      );
      await checkResponse(response);
      return response.json();
    },
    onSuccess: (result) => client.setQueryData(idsKey, result),
    onError: (error) => toast(error.message || "Не удалось сохранить избранное"),
  });

  function select(productId: string, selected: boolean, announce = true) {
    if (change.isPending || merging) return;
    const removed = () => {
      if (!selected && announce)
        toast("Убрано из избранного", { label: "Вернуть", run: () => select(productId, true, false) });
    };
    if (signedIn && query.isSuccess) {
      if (!selected && local.includes(productId)) store(local.filter((id) => id !== productId));
      change.mutate({ productId, selected, key: crypto.randomUUID() }, { onSuccess: removed });
    } else {
      const remaining = local.filter((id) => id !== productId);
      store(selected ? [productId, ...remaining] : remaining);
      removed();
    }
  }
  return {
    ids,
    selected: new Set(ids),
    select,
    signedIn,
    pending: change.isPending ? change.variables.productId : undefined,
    loading: signedIn && query.isPending && !local.length,
    failed: signedIn && query.isError,
    mergeFailed,
    merging,
    retry: () => {
      resetMerge();
      void query.refetch();
    },
  };
}

const Favorites = createContext<ReturnType<typeof useFavoriteState> | null>(null);
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const state = useFavoriteState();
  return <Favorites value={state}>{children}</Favorites>;
}
export function useFavorites() {
  return useContext(Favorites);
}
