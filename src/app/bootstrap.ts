import type { ShopContext } from "../shared/contracts/shop-context";
import { resolveFeatures } from "../shared/flags";
import { cabinetStorefront, loadCabinetStorefront } from "./cabinet-storefront";

function readBootstrap(): ShopContext | undefined {
  try {
    // HTMLRewriter embeds a snapshot already validated by shopContextContract on
    // the server. Only check its transport shape here; client flags grant no rights.
    const raw: unknown = JSON.parse(document.getElementById("shop-context")?.textContent ?? "null");
    if (!raw || typeof raw !== "object") return undefined;
    const value = raw as Record<string, unknown>;
    if (["id", "slug", "name", "status", "plan"].some((key) => typeof value[key] !== "string")) return undefined;
    if (
      !Number.isSafeInteger(value.createdAt) ||
      !value.features ||
      typeof value.features !== "object" ||
      Array.isArray(value.features)
    )
      return undefined;
    const overrides = Object.entries(value.features);
    if (overrides.some(([, enabled]) => typeof enabled !== "boolean")) return undefined;
    const context = value as unknown as ShopContext;
    return {
      ...context,
      features: resolveFeatures(overrides.map(([key, enabled]) => ({ key, enabled: enabled === true }))),
    };
  } catch {
    return undefined;
  }
}

export const bootstrap = cabinetStorefront ? await loadCabinetStorefront() : readBootstrap();
export const buyerStorefrontOpen = bootstrap?.status === "active" || bootstrap?.teamPreview === true;
