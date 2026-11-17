import { expect, it } from "vitest";
import { compressedSize } from "./prepare";

it("снимок с телефона 4032×3024 уменьшается до 2048×1536, маленькие фото не растягиваются", () => {
  expect(compressedSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
  expect(compressedSize(3024, 4032)).toEqual({ width: 1536, height: 2048 });
  expect(compressedSize(100, 80)).toEqual({ width: 100, height: 80 });
});
