import { useLayoutEffect, useState } from "react";

// A fixed sheet is positioned in the layout viewport. On iOS the keyboard
// shrinks and sometimes pans the visual viewport without resizing the layout.
export function useSheetViewport(enabled: boolean) {
  const [panel, sheet] = useState<HTMLDivElement | null>(null);
  const [content, scroller] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport || !panel || !content) return;

    let frame = 0;
    function update() {
      if (!viewport || !panel || !content) return;
      const bottom = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      panel.style.setProperty("--sheet-viewport-bottom", `${bottom}px`);
      panel.style.setProperty("--sheet-viewport-height", `${viewport.height}px`);

      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !field.matches("input,textarea,select") || !content.contains(field))
        return;
      const fieldBounds = field.getBoundingClientRect();
      const contentBounds = content.getBoundingClientRect();
      const above = fieldBounds.top - contentBounds.top - 8;
      const below = fieldBounds.bottom - contentBounds.bottom + 8;
      if (above < 0) content.scrollTop += above;
      else if (below > 0) content.scrollTop += below;
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }

    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    content.addEventListener("focusin", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      content.removeEventListener("focusin", schedule);
      panel.style.removeProperty("--sheet-viewport-bottom");
      panel.style.removeProperty("--sheet-viewport-height");
    };
  }, [enabled, panel, content]);

  return { sheet, scroller };
}
