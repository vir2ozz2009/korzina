import { expect, type Page } from "@playwright/test";
import { shopContactsInput } from "../src/shared/contracts/checkout";

export async function verifyPaymentHelp(page: Page, local: boolean) {
  const support = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/checkout/support");
  await page.getByRole("button", { name: "Проблема с оплатой?" }).click();
  const help = page.getByRole("dialog", { name: "Помощь с оплатой" });
  const response = await support;
  expect(response.ok()).toBe(true);
  const contacts = shopContactsInput.parse(await response.json());
  if (local) expect(contacts).toContainEqual({ title: "Поддержка demo", href: "mailto:shop@example.invalid" });
  if (contacts.length === 0) await expect(help.getByText("Контакты магазина пока недоступны")).toBeVisible();
  for (const { title, href } of contacts)
    await expect(help.getByRole("link", { name: title, exact: true })).toHaveAttribute("href", href);
  await help.getByRole("button", { name: "Закрыть", exact: true }).click();
}
