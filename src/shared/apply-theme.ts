import { resolveTheme, type ShopTheme } from "./theme-presets";

export function applyTheme(theme: ShopTheme) {
  for (const [key, value] of Object.entries(resolveTheme(theme)))
    document.documentElement.style.setProperty(key, value);
}
