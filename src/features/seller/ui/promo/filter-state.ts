import { useEffect, useState } from "react";

// Only the UI selection is kept per shop/account. Report and offer data always come from the API.
function useSelection<T extends object>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored ? { ...initial, ...JSON.parse(stored) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The filters still work for this screen if browser storage is disabled.
    }
  }, [key, value]);
  return { value, patch: (change: Partial<T>) => setValue((previous) => ({ ...previous, ...change })) };
}
export function useListFilters(store: string, account: string) {
  const { value, patch } = useSelection(`korzina:promo-list:${store}:${account}`, { kind: "", status: "", offset: 0 });
  return {
    ...value,
    setKind: (kind: string) => patch({ kind }),
    setStatus: (status: string) => patch({ status }),
    setOffset: (offset: number) => patch({ offset }),
  };
}
const reportKey = (store: string, account: string, id: string) => `korzina:promo-report:${store}:${account}:${id}`;
export function clearReportFilters(store: string, account: string, id: string) {
  try {
    sessionStorage.removeItem(reportKey(store, account, id));
  } catch {
    // There is no saved selection when storage is disabled.
  }
}
export function useReportFilters(store: string, account: string, id: string) {
  const { value, patch } = useSelection(reportKey(store, account, id), {
    period: "all",
    custom: { from: "", through: "" },
    offset: 0,
    detail: false,
  });
  return {
    ...value,
    setPeriod: (period: string) => patch({ period, offset: 0 }),
    setCustom: (custom: typeof value.custom) => patch({ custom, offset: 0 }),
    setOffset: (offset: number) => patch({ offset }),
    setDetail: (detail: boolean) => patch({ detail }),
  };
}
