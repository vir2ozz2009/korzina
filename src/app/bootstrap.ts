import { applyTheme } from "../shared/apply-theme";
import { shopContextContract } from "../shared/contracts/shop-context";

function readBootstrap() {
  try {
    const parsed = shopContextContract.safeParse(
      JSON.parse(document.getElementById("shop-context")?.textContent ?? "null"),
    );
    if (!parsed.success) return undefined;
    if (!/^\/(seller|admin)(\/|$)/.test(location.pathname)) applyTheme(parsed.data.theme);
    return parsed.data;
  } catch {
    return undefined;
  }
}

export const bootstrap = readBootstrap();
