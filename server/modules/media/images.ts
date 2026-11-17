import { type MediaPurpose, maxMediaBytes, mediaWidths, publicPurposes } from "../../../src/shared/contracts/media";
import { ApiError } from "../../../src/shared/errors";
import { goodCutout } from "./cutout";
import { stripWebpMetadata } from "./metadata";

export type Rendition = { name: string; bytes: Uint8Array; mime: string };
const stream = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]).stream();

export async function processImage(
  images: Pick<ImagesBinding, "info" | "input">,
  bytes: Uint8Array,
  purpose: MediaPurpose,
): Promise<Rendition[]> {
  try {
    const info = await images.info(stream(bytes));
    if (!("width" in info) || info.width * info.height > 40_000_000)
      throw new ApiError("VALIDATION", "Фото должно быть не больше 40 мегапикселей");
    const render = async (
      source: Uint8Array,
      transform: ImageTransform,
      format: "image/webp" | "image/png",
    ): Promise<Uint8Array> => {
      const result = await images
        .input(stream(source))
        .transform(transform)
        .output({ format, quality: 85, anim: false });
      const data = new Uint8Array(await result.response().arrayBuffer());
      if (data.length > maxMediaBytes) throw new ApiError("PAYLOAD_TOO_LARGE", "Фото после обработки больше 10 МБ");
      return format === "image/webp" ? stripWebpMetadata(data) : data;
    };
    // Re-encoding is mandatory, including already compressed uploads; never retain original EXIF.
    const original = await render(bytes, { width: 2048, height: 2048, fit: "scale-down" }, "image/webp");
    const result: Rendition[] = [{ name: "original.webp", bytes: original, mime: "image/webp" }];
    if (!publicPurposes.includes(purpose)) return result;
    if (purpose === "product") {
      try {
        const mask = await render(original, { segment: "foreground" }, "image/png");
        const sample = await render(mask, { width: 64, height: 64, fit: "contain" }, "image/png");
        if (goodCutout(sample))
          result.push({ name: "cutout.webp", bytes: await render(mask, {}, "image/webp"), mime: "image/webp" });
      } catch {
        /* Background removal is optional; the sanitized photo remains usable. */
      }
    }
    for (const source of [...result])
      for (const width of mediaWidths) {
        result.push({
          name: source.name.replace(".webp", `-${width}.webp`),
          bytes: await render(source.bytes, { width, fit: "scale-down" }, "image/webp"),
          mime: "image/webp",
        });
      }
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("MEDIA_UNAVAILABLE", "Не удалось обработать фото. Попробуйте ещё раз");
  }
}
