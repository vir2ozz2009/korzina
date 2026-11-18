import { useState } from "react";

export function useSearchHistory(shop: string) {
  const key = `korzina-search:${shop}`;
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === "string").slice(0, 8)
        : [];
    } catch {
      return [];
    }
  });
  const remember = (value: string) => {
    const entry = value.trim();
    if (entry.length < 2) return;
    const updated = [entry, ...history.filter((item) => item !== entry)].slice(0, 8);
    setHistory(updated);
    try {
      localStorage.setItem(key, JSON.stringify(updated));
    } catch {}
  };
  const clear = () => {
    setHistory([]);
    try {
      localStorage.removeItem(key);
    } catch {}
  };
  return { history, remember, clear };
}
