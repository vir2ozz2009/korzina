import type { FulfillmentSettings } from "../../../src/shared/contracts/receiving";
import { activePause } from "./pause";
import type { emptySelection } from "./service";

type Selection = ReturnType<typeof emptySelection>;

export function currentSelection<T extends Selection>(selection: T, settings: FulfillmentSettings, now = Date.now()) {
  const available = (mode: "delivery" | "pickup") => !!settings[mode] && !activePause(settings, mode, now);
  const preferred = selection.explicitMode;
  const effectiveMode =
    preferred && available(preferred)
      ? preferred
      : available("delivery")
        ? "delivery"
        : available("pickup")
          ? "pickup"
          : null;
  const receiving =
    selection.receiving?.mode === effectiveMode
      ? selection.receiving
      : effectiveMode === "pickup"
        ? { mode: "pickup" as const }
        : null;
  return {
    ...selection,
    receiving,
    effectiveMode,
    time: selection.receiving?.mode === effectiveMode ? selection.time : null,
  };
}
