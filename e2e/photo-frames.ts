import { expect, type Locator } from "@playwright/test";

export async function expectSquarePhotos(frames: Locator) {
  await expect(frames.first()).toBeVisible();
  const photos = await frames.evaluateAll((frames) =>
    frames.map((frame) => {
      const { width, height } = frame.getBoundingClientRect();
      const image = frame.querySelector("img");
      return {
        width,
        height,
        image: image
          ? { fit: getComputedStyle(image).objectFit, width: image.clientWidth, height: image.clientHeight }
          : null,
      };
    }),
  );
  for (const { width, height, image } of photos) {
    expect(Math.abs(width - height), "Рамка фото товара 1:1").toBeLessThan(1);
    if (image) {
      expect(image.fit, "Фото заполняет рамку с сохранением пропорций").toBe("cover");
      expect(Math.abs(image.width - width), "Фото заполняет рамку по ширине").toBeLessThan(1);
      expect(Math.abs(image.height - height), "Фото заполняет рамку по высоте").toBeLessThan(1);
    }
  }
}

export async function expectCategoryFrames(rail: Locator, shapes: readonly string[]) {
  await expect(rail.locator("[data-size]").first()).toBeVisible();
  const tiles = await rail.evaluate((element) => {
    const cell = (element.getBoundingClientRect().width + 8) / 3.3 - 8;
    return Array.from(element.querySelectorAll("[data-size]")).map((tile) => {
      const size = tile.getAttribute("data-size");
      const { width, height } = tile.getBoundingClientRect();
      const photo = tile.querySelector("[data-category-photo]");
      const frame = photo?.getBoundingClientRect();
      return {
        size,
        width,
        height,
        cell,
        photo: frame && {
          width: frame.width,
          height: frame.height,
          fit: photo && getComputedStyle(photo).objectFit,
          area: photo?.parentElement?.parentElement?.getBoundingClientRect().toJSON(),
          titleBottom: tile.querySelector("span")?.getBoundingClientRect().bottom,
          top: frame.top,
        },
      };
    });
  });
  expect(tiles.filter(({ photo }) => photo).map((tile) => tile.size)).toEqual(expect.arrayContaining([...shapes]));
  for (const { size, cell, width, height, photo } of tiles) {
    const wide = size?.startsWith("2") ?? false;
    const tall = size?.endsWith("2") ?? false;
    expect(Math.abs(width - (wide ? 2 * cell + 8 : cell)), `Ширина плитки категории ${size}`).toBeLessThan(1);
    expect(Math.abs(height - (tall ? 2 * cell + 8 : cell)), `Высота плитки категории ${size}`).toBeLessThan(1);
    if (!photo) continue;
    expect(photo.fit).toBe("contain");
    const scale = size === "1x1" ? 0.7 : 1;
    expect(Math.abs(photo.width - photo.area.width * scale)).toBeLessThan(1);
    expect(Math.abs(photo.height - photo.area.height * scale)).toBeLessThan(1);
    expect(photo.top).toBeGreaterThanOrEqual(photo.titleBottom ?? 0);
  }
}
