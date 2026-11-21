import { expect, type Locator, type Page } from "@playwright/test";

export async function confirmAddressWithoutGeocoders(page: Page, search: Locator, address: string) {
  await page.route("**/api/receiving/verify-address?**", (route) => {
    if (route.request().postDataJSON().address === address) {
      return route.fulfill({
        status: 503,
        json: { error: { code: "GEOCODER_UNAVAILABLE", message: "Сбой обоих геокодеров" } },
      });
    }
    return route.fulfill({ json: { point: null } });
  });
  const verification = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/receiving/verify-address",
  );
  await search.getByRole("button", { name: "Сохранить адрес вручную" }).click();
  expect((await verification).postDataJSON()).toEqual({ address });
}
