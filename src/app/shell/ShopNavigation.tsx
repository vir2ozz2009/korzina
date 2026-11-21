import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

// UI-kit anchors stay framework independent. Keyboard activation also emits click.
export function ShopNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target || anchor.hasAttribute("download") || !anchor.getAttribute("href")?.startsWith("/"))
        return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin) return;
      event.preventDefault();
      const current = new URLSearchParams(location.search);
      for (const key of ["shop", "viewer", "telegram"]) {
        const value = current.get(key);
        if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
      }
      void router.navigate({ href: url.pathname + url.search + url.hash });
    };
    document.addEventListener("click", navigate);
    return () => document.removeEventListener("click", navigate);
  }, [router]);
  return children;
}
