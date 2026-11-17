import { describe, expect, it, vi } from "vitest";
import { revisionResponse } from "./revisions";

describe("ревизии", () => {
  it.each(['"7"', 'W/"7"', '"2", W/"7"', "*"])("ETag %s даёт 304 без чтения записей", (etag) => {
    const read = vi.fn();
    const response = revisionResponse(
      new Request("https://local/api/list", { headers: { "If-None-Match": etag } }),
      7,
      read,
    );
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("rev даёт unchanged, новая ревизия читает записи один раз", async () => {
    const read = vi.fn(() => ["record"]);
    expect(await revisionResponse(new Request("https://local/api/list?rev=7"), 7, read).json()).toEqual({
      unchanged: true,
      rev: 7,
    });
    expect(read).not.toHaveBeenCalled();
    const response = revisionResponse(new Request("https://local/api/list?rev=6"), 7, read);
    expect(await response.json()).toEqual({ rev: 7, data: ["record"] });
    expect(response.headers.get("etag")).toBe('"7"');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
