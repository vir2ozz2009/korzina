import { type MediaPurpose, maxMediaBytes, mediaWidths, publicPurposes } from "../../../src/shared/contracts/media";
import { ApiError } from "../../../src/shared/errors";
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
    const render = async (source: Uint8Array, transform: ImageTransform): Promise<Uint8Array> => {
      const result = await images
        .input(stream(source))
        .transform(transform)
        .output({ format: "image/webp", quality: 85, anim: false });
      const data = new Uint8Array(await result.response().arrayBuffer());
      if (data.length > maxMediaBytes) throw new ApiError("PAYLOAD_TOO_LARGE", "Фото после обработки больше 10 МБ");
      return stripWebpMetadata(data);
    };
    // Re-encoding is mandatory, including already compressed uploads; never retain original EXIF.
    const original = await render(bytes, { width: 2048, height: 2048, fit: "scale-down" });
    const result: Rendition[] = [{ name: "original.webp", bytes: original, mime: "image/webp" }];
    if (!publicPurposes.includes(purpose)) return result;
    for (const width of mediaWidths) {
      result.push({
        name: `original-${width}.webp`,
        bytes: await render(original, { width, fit: "scale-down" }),
        mime: "image/webp",
      });
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("MEDIA_UNAVAILABLE", "Не удалось обработать фото. Попробуйте ещё раз");
  }
}
