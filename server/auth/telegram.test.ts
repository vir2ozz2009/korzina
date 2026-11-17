import { describe, expect, it } from "vitest";
import { signedInitData } from "../testing/auth";
import { verifyInitData } from "./telegram";

const token = "12345:korzina-synthetic-test-only";
describe("Telegram initData HMAC", () => {
  it("совпадает с независимым контрольным вектором Node createHmac", async () => {
    const fixture =
      "auth_date=1794890130&query_id=fixture&user=%7B%22id%22%3A12345%7D&hash=aa72cc9baebe68dda1d3047d51d9d1ea14a11c99d240d1961cb3c7db3daba16b";
    expect(await verifyInitData(fixture, token, 1794890130000)).toEqual({ telegramId: "12345", authDate: 1794890130 });
  });
  it("принимает подписанного пользователя", async () => {
    expect(await verifyInitData(await signedInitData(token), token)).toMatchObject({ telegramId: "12345" });
  });
  it("отклоняет подмену пользователя и подпись другого бота", async () => {
    const data = await signedInitData(token);
    const tampered = new URLSearchParams(data);
    tampered.set("user", '{"id":999}');
    await expect(verifyInitData(tampered.toString(), token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(verifyInitData(data, "other-test-bot")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("отклоняет просроченные, будущие и дублированные данные", async () => {
    for (const auth_date of [
      String(Math.floor(Date.now() / 1000) - 86_401),
      String(Math.floor(Date.now() / 1000) + 60),
      "not-a-date",
    ]) {
      await expect(verifyInitData(await signedInitData(token, { auth_date }), token)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    }
    const data = await signedInitData(token);
    await expect(verifyInitData(`${data}&user=%7B%22id%22%3A999%7D`, token)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(verifyInitData(data.replace(/hash=[^&]+/, "hash=bad"), token)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it.each(["null", "{}", '{"id":-1}', '{"id":1.5}', '{"id":9007199254740992}'])(
    "отклоняет неверный user %s",
    async (user) => {
      await expect(verifyInitData(await signedInitData(token, { user }), token)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    },
  );
});
