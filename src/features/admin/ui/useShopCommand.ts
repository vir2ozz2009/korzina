import { useRef } from "react";
import type { ShopChange } from "../../../shared/contracts/admin";
import { errorKind } from "../../../shared/http-error";
import { useShopChange } from "../api";

export function useShopCommand(id: string) {
  const mutation = useShopChange(id);
  const operation = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  return {
    pending: mutation.isPending,
    error: mutation.error?.message,
    submit(input: ShopChange, ready?: () => void) {
      if (mutation.isPending) return;
      const fingerprint = JSON.stringify(input);
      const key = operation.current?.fingerprint === fingerprint ? operation.current.key : crypto.randomUUID();
      operation.current = { fingerprint, key };
      mutation.mutate(
        { input, key },
        {
          onSuccess: () => {
            operation.current = undefined;
            ready?.();
          },
          onError: (error) => {
            if (errorKind(error) !== "retry") operation.current = undefined;
          },
        },
      );
    },
  };
}
