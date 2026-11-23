import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { formatShopDay } from "../../../shared/datetime";
import { TimeControls } from "./TimeControls";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("PR 228 · 10: шторка обозначает целый день и отправляет перенос без интервала", async () => {
  const day = "2099-01-21";
  const timeZone = "Asia/Ho_Chi_Minh";
  const send = vi.fn();
  vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
    expect(url.pathname).toBe("/api/orders/42/time");
    if (init.method === "POST") {
      send(JSON.parse(String(init.body)));
      return Response.json({ ok: true });
    }
    return Response.json({
      mode: "day",
      timeZone,
      days: [{ date: day, available: true, intervals: [] }],
    });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TimeControls number={42} revision={3} time={{ date: "2099-01-20" }} timeZone={timeZone} editable />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Попросить другое время" }));
  const sheet = within(await screen.findByRole("dialog", { name: "Выбрать другое время" }));
  fireEvent.click(await sheet.findByRole("radio", { name: `${formatShopDay(day, timeZone)} · В течение дня` }));
  fireEvent.click(sheet.getByRole("button", { name: "Попросить перенос" }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledExactlyOnceWith({
      action: "propose",
      expectedVersion: 3,
      time: { date: day },
    }),
  );
});
