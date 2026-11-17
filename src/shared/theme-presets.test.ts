import { describe, expect, it } from "vitest";
import {
  contrast,
  deriveTheme,
  normalizeTheme,
  resolveTheme,
  THEME_PRESETS,
  themeStyle,
  validateCustomColor,
} from "./theme-presets";

describe("правила оформления витрины", () => {
  it("все пресеты сохраняют контраст кнопки, текста и сильного акцента", () => {
    for (const { vars } of THEME_PRESETS) {
      expect(contrast(vars["--primary"], vars["--primary-foreground"])).toBeGreaterThanOrEqual(3);
      expect(contrast(vars["--primary-text"], "#ffffff")).toBeGreaterThanOrEqual(3);
      expect(contrast(vars["--primary-strong"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("светлый, тёмный и яркий цвет дают читаемый текст и только разрешённые CSS-переменные", () => {
    for (const color of ["#f8c537", "#101828", "#00ff22"]) {
      const vars = deriveTheme(color);
      expect(contrast(color, vars["--primary-foreground"])).toBeGreaterThanOrEqual(
        vars["--primary-foreground"] === "#ffffff" ? 3 : 4.5,
      );
      expect(contrast(vars["--primary-text"], "#ffffff")).toBeGreaterThanOrEqual(3);
      expect(contrast(vars["--primary-strong"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(themeStyle({ custom: color })).toMatch(/^--[a-z-]+:#[a-f0-9]{6}(;--[a-z-]+:#[a-f0-9]{6}){5}$/);
    }
    expect(deriveTheme("#f8c537")["--primary-foreground"]).toBe("#1a1a1a");
  });
  it("почти белый и испорченные значения отвергаются, хранимый мусор безопасно сбрасывается", () => {
    expect(validateCustomColor("#fafafa")).toEqual({ ok: false, reason: "too_light" });
    expect(() => deriveTheme("#fafafa")).toThrow();
    for (const value of [{ custom: "red;display:none" }, { custom: null }, { preset: "missing" }, [], "x", null]) {
      expect(normalizeTheme(value)).toEqual({ preset: "raspberry" });
      expect(resolveTheme(value)).toEqual(THEME_PRESETS[0].vars);
    }
  });
});
