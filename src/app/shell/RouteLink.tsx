import { Link, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";

// Only this public, light destination opts in to viewport data preloading.
export function PublicProductLink({
  children,
  className,
  "aria-label": label,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void router.preloadRoute({ to: "/p/demo" });
        observer.disconnect();
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [router]);
  return (
    <Link to="/p/demo" ref={ref} preload="intent" className={className} aria-label={label}>
      {children}
    </Link>
  );
}
