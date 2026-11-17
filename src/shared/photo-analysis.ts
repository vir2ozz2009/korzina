import type { ContentBox } from "./contracts/media";
export interface PhotoAnalysis {
  edgeColor: string;
  contentBox?: ContentBox;
  width: number;
  height: number;
}
function sample(image: ImageBitmap, maxSide: number) {
  const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Не удалось прочитать фото");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
  };
}
/** Run once per selected file; rendering only reads the saved metadata. */
export async function analyzePhoto(file: Blob): Promise<PhotoAnalysis> {
  const image = await createImageBitmap(file);
  try {
    const edge = sample(image, 32);
    const sums = [0, 0, 0];
    let count = 0;
    for (let y = 0; y < edge.height; y++)
      for (let x = 0; x < edge.width; x++) {
        if (x !== 0 && x !== edge.width - 1 && y !== 0 && y !== edge.height - 1) continue;
        const offset = (y * edge.width + x) * 4;
        for (let c = 0; c < 3; c++) sums[c] += edge.pixels[offset + c];
        count++;
      }
    const rgb = sums.map((sum) => Math.round(sum / count));
    const edgeColor = `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    const content = sample(image, 256);
    let left = content.width,
      top = content.height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < content.height; y++)
      for (let x = 0; x < content.width; x++) {
        const offset = (y * content.width + x) * 4;
        if (!rgb.some((color, c) => Math.abs(content.pixels[offset + c] - color) > 12)) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    let contentBox: ContentBox | undefined;
    if (right >= left && bottom >= top) {
      const padX = (right - left + 1) * 0.04,
        padY = (bottom - top + 1) * 0.04;
      const x = Math.max(0, left - padX) / content.width,
        y = Math.max(0, top - padY) / content.height;
      contentBox = {
        x,
        y,
        w: Math.min(content.width, right + 1 + padX) / content.width - x,
        h: Math.min(content.height, bottom + 1 + padY) / content.height - y,
      };
    }
    return { edgeColor, contentBox, width: image.width, height: image.height };
  } finally {
    image.close();
  }
}
