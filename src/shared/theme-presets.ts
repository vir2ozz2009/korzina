/**
 * Оформление витрины магазина: пресеты и свой цвет. Единственный источник.
 * Продавец выбирает в кабинете (Настройки → Оформление витрины); значение хранится в settings магазина как ShopTheme.
 * Меняются ТОЛЬКО акцентные токены витрины. Нейтральные цвета, шрифт, радиусы и кабинет продавца не меняются.
 * Правила: docs/design-system/tokens.md «Оформление магазина».
 *
 * Свой цвет: продавец задаёт только primary, остальные токены вычисляются так, чтобы текст всегда читался:
 *  - цвет текста на кнопке — белый, если контраст ≥ 3:1 (как у пресетов), иначе тёмный (тогда ≥ 4.5:1);
 *  - почти белые цвета (контраст с белым < MIN_ACCENT_CONTRAST) не принимаются: кнопки сольются с карточками;
 *  - акцентный текст на белом — primary, если контраст ≥ 3:1, иначе затемнённый до ≥ 4.5:1;
 *  - strong — затемнённый до контраста с белым ≥ 4.5:1; soft — 8% цвета на белом.
 */

type ThemePresetId = "raspberry" | "tomato" | "orange" | "herb" | "forest" | "berry" | "sea" | "chocolate" | "graphite";

/** Что хранится в settings магазина */
export type ShopTheme = { preset: ThemePresetId } | { custom: string };

export type ThemeVars = {
  "--primary": string;
  "--primary-foreground": string;
  "--primary-soft": string;
  "--primary-strong": string;
  "--primary-text": string;
  "--ring": string;
};

export interface ThemePreset {
  id: ThemePresetId;
  name: string;
  vars: ThemeVars;
}

const WHITE = "#ffffff";
const DARK = "#1a1a1a";
export const HEX_RE = /^#[0-9a-f]{6}$/i;
export const CUSTOM_PREVIEW_COLOR = "#f8c537";

// ---------- цветовая математика (sRGB, WCAG 2.x) ----------
const toRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
};
const toHex = (rgb: number[]): string =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const luminance = (hex: string): number => {
  const [r, g, b] = toRgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
/** t = 0 → a, t = 1 → b */
const mix = (a: string, b: string, t: number): string => {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex(A.map((c, i) => c * (1 - t) + (B[i] as number) * t));
};
/** Затемнять, пока контраст с белым не станет ≥ target */
const darkenUntil = (hex: string, target: number, minStep = 0): string => {
  for (let t = minStep; t <= 1; t += 0.02) {
    const c = mix(hex, "#000000", t);
    if (contrast(c, WHITE) >= target) return c;
  }
  return DARK;
};

/** Токены из одного цвета продавца. Для любого hex текст остаётся читаемым. */
export function deriveTheme(primaryHex: string): ThemeVars {
  if (!validateCustomColor(primaryHex).ok) throw new Error("Недопустимый цвет витрины");
  const primary = primaryHex.toLowerCase();
  return {
    "--primary": primary,
    "--primary-foreground": contrast(primary, WHITE) >= 3 ? WHITE : DARK,
    "--primary-soft": mix(primary, WHITE, 0.92),
    "--primary-strong": darkenUntil(primary, 4.5, 0.15),
    "--primary-text": contrast(primary, WHITE) >= 3 ? primary : darkenUntil(primary, 4.5),
    "--ring": primary,
  };
}

/** Ниже — цвет почти белый: кнопка не отличается от белой карточки */
const MIN_ACCENT_CONTRAST = 1.3;

/** Проверка своего цвета перед сохранением (клиент и сервер) */
export function validateCustomColor(hex: string): { ok: true } | { ok: false; reason: "format" | "too_light" } {
  if (!HEX_RE.test(hex)) return { ok: false, reason: "format" };
  if (contrast(hex, WHITE) < MIN_ACCENT_CONTRAST) return { ok: false, reason: "too_light" };
  return { ok: true };
}

/** Подсказка в кабинете: при светлом цвете кнопки будут с тёмным текстом */
export const isLightAccent = (hex: string): boolean => deriveTheme(hex)["--primary-foreground"] === DARK;

// ---------- пресеты ----------
const preset = (id: ThemePresetId, name: string, primary: string, soft: string, strong: string): ThemePreset => ({
  id,
  name,
  vars: {
    "--primary": primary,
    "--primary-foreground": WHITE,
    "--primary-soft": soft,
    "--primary-strong": strong,
    "--primary-text": primary,
    "--ring": primary,
  },
});

export const DEFAULT_THEME: ShopTheme = { preset: "raspberry" };

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

const DEFAULT_PRESET = THEME_PRESETS[0] as ThemePreset;

/** Итоговые токены для темы магазина; неизвестное или битое значение → пресет по умолчанию */
export function normalizeTheme(theme: unknown): ShopTheme {
  if (theme && typeof theme === "object") {
    if ("custom" in theme && typeof theme.custom === "string" && validateCustomColor(theme.custom).ok)
      return { custom: theme.custom.toLowerCase() };
    if ("preset" in theme && THEME_PRESETS.some((p) => p.id === theme.preset))
      return { preset: theme.preset as ThemePresetId };
  }
  return DEFAULT_THEME;
}

export function resolveTheme(input: unknown): ThemeVars {
  const theme = normalizeTheme(input);
  if ("custom" in theme) return deriveTheme(theme.custom);
  if ("preset" in theme) return (THEME_PRESETS.find((p) => p.id === theme.preset) ?? DEFAULT_PRESET).vars;
  return DEFAULT_PRESET.vars;
}

/** Строка для атрибута style корневого элемента витрины (Worker при отдаче HTML и клиент). */
export function themeStyle(theme: ShopTheme | null | undefined): string {
  return Object.entries(resolveTheme(theme))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
