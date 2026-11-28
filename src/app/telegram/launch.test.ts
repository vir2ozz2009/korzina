import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("Telegram launch survives a reload after router navigation removes launch parameters", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { hash: "#tgWebAppData=signed", search: "" });
  expect((await import("./launch")).telegramLaunch).toBe(true);
  vi.resetModules();
  vi.stubGlobal("location", { hash: "", search: "?shop=test2" });
  expect((await import("./launch")).telegramLaunch).toBe(true);
});

test("ordinary browser sessions do not become Telegram sessions", async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { hash: "", search: "?shop=test2" });
  vi.stubGlobal("sessionStorage", { getItem: () => null });
  expect((await import("./launch")).telegramLaunch).toBe(false);
});

test("launch still works when session storage is unavailable", async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { hash: "#tgWebAppData=signed", search: "" });
  vi.stubGlobal("sessionStorage", {
    setItem: () => {
      throw new Error("blocked");
    },
  });
  expect((await import("./launch")).telegramLaunch).toBe(true);
});
