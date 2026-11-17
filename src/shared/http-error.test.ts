import { expect, it } from "vitest";
import { createQueryClient } from "../app/query-defaults";
import { checkResponse, errorKind, HttpError } from "./http-error";

it("401/403 не предлагают и не запускают повтор, сеть и 5xx допускают повтор", async () => {
  const client = createQueryClient();
  const retry = client.getDefaultOptions().queries?.retry;
  expect(typeof retry).toBe("function");
  if (typeof retry !== "function") throw new Error("Нужна политика повторов по ошибке");
  for (const status of [401, 403]) {
    let error: unknown;
    try {
      await checkResponse({
        ok: false,
        status,
        json: async () => ({ error: { code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: "denied" } }),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect(errorKind(error)).toBe("access");
    expect(retry(0, error as Error)).toBe(false);
  }
  for (const error of [new TypeError("Failed to fetch"), new HttpError(503, "Unavailable")]) {
    expect(errorKind(error)).toBe("retry");
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(false);
  }
  expect(errorKind(new HttpError(400, "Invalid file"))).toBe("message");
  client.clear();
});
