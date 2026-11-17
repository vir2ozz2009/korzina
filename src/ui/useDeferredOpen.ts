import { useEffect, useState } from "react";

export function useDeferredOpen(open: boolean) {
  const [activated, setActivated] = useState(open);
  useEffect(() => {
    if (open) setActivated(true);
  }, [open]);
  return activated;
}
