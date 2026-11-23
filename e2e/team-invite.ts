import { type Browser, expect } from "@playwright/test";
import type { StaffInvite } from "../src/shared/contracts/staff";
import { placePickup } from "./seller-orders";

export async function checkStaffInvite(browser: Browser, baseURL: string) {
  const viewport = { width: 390, height: 844 };
  const [owner, picker] = await Promise.all([
    browser.newContext({ baseURL, viewport, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.91" } }),
    browser.newContext({ baseURL, viewport, extraHTTPHeaders: { "CF-Connecting-IP": "192.0.2.92" } }),
  ]);
  try {
    expect((await owner.request.post("/__e2e/test2/seller")).status()).toBe(204);
    const ownerPage = await owner.newPage();
    ownerPage.setDefaultTimeout(8_000);
    await ownerPage.goto("/seller/team?store=test2");
    await ownerPage.getByRole("button", { name: "Добавить сотрудника", exact: true }).click();
    const form = ownerPage.getByRole("dialog", { name: "Добавить сотрудника" });
    await expect(form.getByRole("button", { name: /Роль Сборщик/u })).toBeVisible();
    const created = ownerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/seller/team/invites" && response.request().method() === "POST",
    );
    await form.getByRole("button", { name: "Создать приглашение", exact: true }).click();
    const invitation = await created;
    expect(invitation.status(), await invitation.text()).toBe(201);
    const { url } = (await invitation.json()) as StaffInvite;
    if (!url) throw new Error("Сервер не вернул ссылку приглашения");
    await expect(ownerPage.getByRole("dialog", { name: "Приглашение" }).getByText(url, { exact: true })).toBeVisible();

    const openInvite = (context: typeof owner, user: "owner" | "picker") =>
      context.request.post("/__e2e/test2/staff-invite", { data: { url, user } });
    const accepted = await openInvite(picker, "picker");
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toEqual({ state: "accepted", shop: "korzina-demo-test2" });
    const resumed = await openInvite(picker, "picker");
    expect(resumed.status()).toBe(200);
    expect(await resumed.json()).toEqual({ state: "accepted", shop: "korzina-demo-test2" });
    const reused = await openInvite(owner, "owner");
    expect(reused.status()).toBe(409);
    expect(await reused.json()).toEqual({ state: "used" });

    const order = await placePickup(owner.request, false);
    try {
      const ownerOrders = await owner.request.get("/api/seller/orders?store=test2");
      expect(await ownerOrders.json()).toMatchObject({
        orders: expect.arrayContaining([
          expect.objectContaining({ number: order.number, totalMinor: order.totalMinor }),
        ]),
      });
      const page = await picker.newPage();
      page.setDefaultTimeout(8_000);
      await page.goto("/seller/orders?store=test2");
      const card = page.getByRole("button", { name: `Открыть заказ №${order.number}`, exact: true });
      await expect(card).toBeVisible();
      await expect(card.locator("..")).not.toContainText(/₫|₽|Долг клиента/u);
      await expect(page.getByRole("heading", { name: "Заказы", exact: true })).toBeVisible();
      const tabs = page.getByRole("navigation", { name: "Кабинет продавца" });
      await tabs.getByRole("button", { name: "Ещё", exact: true }).click();
      await expect(page.getByRole("button", { name: "Профиль продавца" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Сотрудники", exact: true })).toHaveCount(0);
      await tabs.getByRole("button", { name: /Заказы$/u }).click();
      await expect(card).toBeVisible();

      await ownerPage.goto("/seller/team?store=test2");
      const inviteCode = new URL(url).searchParams.get("start")?.slice(-6);
      const member = ownerPage.getByRole("button").filter({ hasText: `Учебный сборщик ${inviteCode}` });
      await expect(member).toHaveCount(1);
      await member.click();
      await ownerPage.getByRole("button", { name: "Отозвать доступ", exact: true }).click();
      await ownerPage
        .getByRole("dialog", { name: "Отозвать доступ?" })
        .getByRole("button", { name: "Отозвать доступ", exact: true })
        .click();
      await expect(ownerPage.getByText("Доступ отозван", { exact: true })).toBeVisible();
      expect((await picker.request.get(`/api/seller/orders/${order.number}?store=test2`)).status()).toBe(403);
      await card.click();
      await expect(page.getByText("Нет доступа к магазину", { exact: true })).toBeVisible();
      const revoked = await openInvite(picker, "picker");
      expect(revoked.status()).toBe(409);
      expect(await revoked.json()).toEqual({ state: "revoked" });
    } finally {
      const cancel = await owner.request.post(`/api/orders/${order.number}/cancel?shop=test2`, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
        data: { expectedVersion: 0 },
      });
      expect(cancel.ok(), await cancel.text()).toBe(true);
    }
  } finally {
    await Promise.all([owner.close(), picker.close()]);
  }
}
