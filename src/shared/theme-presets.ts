/**
 * Пресеты оформления витрины магазина. Единственный источник.
 * Продавец выбирает пресет в кабинете (Настройки → Оформление витрины), значение хранится в settings магазина.
 * Пресет меняет ТОЛЬКО акцентные токены витрины. Нейтральные цвета, шрифт, радиусы и кабинет продавца не меняются.
 * Правила и применение: docs/design-system/tokens.md «Оформление магазина».
 *
 * Новый пресет: добавить сюда, проверить тест контраста (белый текст на primary ≥ 3:1), показать в /dev/kit.
 */

export type ThemePresetId =
  | "raspberry"
  | "tomato"
  | "orange"
  | "herb"
  | "forest"
  | "berry"
  | "sea"
  | "chocolate"
  | "graphite";

export interface ThemePreset {
  id: ThemePresetId;
  name: string;
  /** Значения CSS-переменных из src/styles/tokens.css, которые переопределяет пресет */
  vars: {
    "--primary": string;
    "--primary-foreground": string;
    "--primary-soft": string;
    "--primary-strong": string;
    "--ring": string;
  };
}

const preset = (id: ThemePresetId, name: string, primary: string, soft: string, strong: string): ThemePreset => ({
  id,
  name,
  vars: {
    "--primary": primary,
    "--primary-foreground": "#ffffff",
    "--primary-soft": soft,
    "--primary-strong": strong,
    "--ring": primary,
  },
});

export const DEFAULT_THEME_PRESET: ThemePresetId = "raspberry";

/** Контраст белого текста на primary указан в комментарии (WCAG). */
export const THEME_PRESETS: readonly ThemePreset[] = [
  preset("raspberry", "Малина", "#ff335f", "#fff0f4", "#d8245b"), // 3.56 — по умолчанию, совпадает с tokens.css
  preset("tomato", "Томат", "#e5432a", "#fdf0ee", "#bc3722"), // 4.06
  preset("orange", "Апельсин", "#e8620c", "#fdf2ec", "#be500a"), // 3.40
  preset("herb", "Зелень", "#1f9254", "#edf6f1", "#197845"), // 3.96
  preset("forest", "Хвоя", "#1e6b4f", "#edf3f1", "#195841"), // 6.42
  preset("berry", "Ягода", "#8a3ab0", "#f6eff9", "#713090"), // 6.34
  preset("sea", "Море", "#1873cc", "#edf4fb", "#145ea7"), // 4.81
  preset("chocolate", "Шоколад", "#7a4a2e", "#f4f1ee", "#643d26"), // 7.38
  preset("graphite", "Графит", "#2b2b2b", "#eeeeee", "#232323"), // 14.16
];

export function getThemePreset(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? (THEME_PRESETS[0] as ThemePreset);
}

/** Строка для атрибута style корневого элемента витрины (используется Worker при отдаче HTML и клиентом). */
export function themeStyle(id: string | null | undefined): string {
  return Object.entries(getThemePreset(id).vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
