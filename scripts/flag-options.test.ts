import { describe, expect, it } from "vitest";
import { flagOptions } from "./flag-options";

describe("CLI флагов", () => {
  it.each(
    [
      [],
      ["lavka", "typo", "on"],
      ["lavka", "cashback", "true"],
      ["../other", "cashback", "off"],
      ["lavka", "cashback", "on", "extra"],
    ].map((args) => ({ args })),
  )("отклоняет ошибку до обращения к базе: $args", ({ args }) => {
    expect(() => flagOptions(args)).toThrow("Использование");
  });
  it("принимает on/off и local", () => {
    expect(flagOptions(["test2", "cashback", "on", "--local"])).toEqual({
      shop: "test2",
      key: "cashback",
      enabled: true,
      local: true,
    });
    expect(flagOptions(["test2", "cashback", "off"])).toMatchObject({ enabled: false, local: false });
  });
});
