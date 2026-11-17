import { useEffect, useState } from "react";

// One gate for code and data: don't flash fast loads; keep visible skeletons for 300 ms.
export function useLoadingGate(pending: boolean) {
  const [shownAt, setShownAt] = useState<number | null>(null);
  useEffect(() => {
    if (pending && shownAt === null) {
      const timer = setTimeout(() => setShownAt(Date.now()), 150);
      return () => clearTimeout(timer);
    }
    if (!pending && shownAt !== null) {
      const timer = setTimeout(() => setShownAt(null), Math.max(0, 300 - (Date.now() - shownAt)));
      return () => clearTimeout(timer);
    }
  }, [pending, shownAt]);
  return { waiting: pending || shownAt !== null, visible: shownAt !== null };
}
