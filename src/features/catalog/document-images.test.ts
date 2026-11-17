import { expect, it } from "vitest";
import { resolveDocumentImage } from "./document-images";

it("один кешируемый документ разрешает все изображения в медиа своего storefront", () => {
  const image = {
    src: "/shop/photo-800.webp",
    srcSet: "/shop/photo-400.webp 400w, /shop/photo-800.webp 800w",
    original: { src: "/shop/photo.webp" },
  };
  const first = resolveDocumentImage(image, "https://first.example");
  const second = resolveDocumentImage(image, "https://second.example");
  expect(first?.src).toBe("https://first.example/shop/photo-800.webp");
  expect(second?.srcSet).toBe(
    "https://second.example/shop/photo-400.webp 400w, https://second.example/shop/photo-800.webp 800w",
  );
  expect(second?.original.src).toBe("https://second.example/shop/photo.webp");
  expect(image.src).toBe("/shop/photo-800.webp");
});

it("внешние demo-фото сохраняются, даже когда origin превью другой", () => {
  const image = {
    src: "https://media.demo.korzina.app/photo.png",
    srcSet: "https://media.demo.korzina.app/photo.png 1200w",
    original: { src: "https://media.demo.korzina.app/photo.png" },
  };
  expect(resolveDocumentImage(image, "https://preview.r2.dev")).toEqual(image);
});
