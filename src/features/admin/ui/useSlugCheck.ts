import { useEffect, useState } from "react";
import { slugProblem } from "../../../shared/contracts/admin";
import { useSlugAvailability } from "../api";

export function useSlugCheck(slug: string, original?: string) {
  const [checked, setChecked] = useState("");
  const unchanged = slug === original;
  const invalid = !unchanged && slug ? slugProblem(slug) : undefined;
  const matched = checked === slug;
  const availability = useSlugAvailability(checked, !unchanged && !!checked && matched && !invalid);
  useEffect(() => {
    if (unchanged) return;
    const timer = window.setTimeout(() => setChecked(slug), 250);
    return () => window.clearTimeout(timer);
  }, [slug, unchanged]);
  const taken = matched && availability.data?.available === false ? availability.data.message : undefined;
  const available = unchanged || (matched && availability.data?.available === true);
  return {
    available,
    message: invalid?.message ?? taken,
    hint:
      !unchanged && available
        ? "Адрес свободен"
        : !unchanged && slug && !invalid && !taken && !availability.isError
          ? "Проверяем адрес…"
          : undefined,
    failed: !unchanged && matched && availability.isError,
    retry: () => void availability.refetch(),
  };
}
