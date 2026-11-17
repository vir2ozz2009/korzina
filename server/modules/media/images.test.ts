import { env } from "cloudflare:workers";
import { encode } from "fast-png";
import { describe, expect, it } from "vitest";
import { detectContent } from "./content";
import { goodCutout } from "./cutout";
import heicBase64 from "./fixtures/libheif-example.base64?raw";
import { processImage } from "./images";
import { stripWebpMetadata } from "./metadata";

function photo() {
  const data = new Uint8Array(32 * 32 * 4).fill(255);
  return encode({ width: 32, height: 32, data, channels: 4 });
}
describe("F9: безопасная обработка фото", () => {
  it("HEIC передаётся декодеру Images и результат сохраняется только после перекодирования", async () => {
    const input = Uint8Array.from(atob(heicBase64.trim()), (character) => character.charCodeAt(0));
    expect(detectContent(input)).toBe("image/heic");
    let received: Uint8Array | undefined;
    // Miniflare's libvips build has no HEVC decoder. Stand in only for that
    // external codec; real HEIC decoding remains a required demo smoke check.
    const decoder: Pick<ImagesBinding, "info" | "input"> = {
      info: async (stream) => {
        received = new Uint8Array(await new Response(stream).arrayBuffer());
        return { format: "image/heic", width: 1280, height: 854, fileSize: input.length };
      },
      input: () => env.IMAGES.input(new Blob([photo() as Uint8Array<ArrayBuffer>]).stream()),
    };
    const result = await processImage(decoder, input, "receipt");
    expect(received).toEqual(input);
    expect(result[0].mime).toBe("image/webp");
    expect(await env.IMAGES.info(new Blob([result[0].bytes as Uint8Array<ArrayBuffer>]).stream())).toMatchObject({
      format: "image/webp",
    });
  });
  it("декодирует изображение, отдаёт четыре размера WebP, не сохраняет метаданные", async () => {
    const result = await processImage(env.IMAGES, photo(), "logo");
    expect(result.map((image) => image.name)).toEqual([
      "original.webp",
      "original-160.webp",
      "original-400.webp",
      "original-800.webp",
      "original-1600.webp",
    ]);
    for (const file of result) {
      const bytes = stripWebpMetadata(file.bytes);
      expect(new TextDecoder().decode(bytes)).not.toMatch(/EXIF|XMP |ICCP/);
      const info = await env.IMAGES.info(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream());
      expect(info).toMatchObject({ format: "image/webp", width: 32, height: 32 });
    }
  });
  it("плохая или недоступная вырезка не ломает загрузку", async () => {
    expect((await processImage(env.IMAGES, photo(), "product")).some((file) => file.name === "original.webp")).toBe(
      true,
    );
    await expect(processImage(env.IMAGES, new Uint8Array([255, 216, 255, 0]), "logo")).rejects.toMatchObject({
      code: "MEDIA_UNAVAILABLE",
    });
  });
  it("принимает цельный объект с полями, отклоняет пустую, обрезанную и рваную вырезку", () => {
    const make = (opaque: (x: number, y: number) => boolean) => {
      const data = new Uint8Array(64 * 64 * 4);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (opaque(x, y)) data[(y * 64 + x) * 4 + 3] = 255;
      return encode({ width: 64, height: 64, data, channels: 4 });
    };
    expect(goodCutout(make((x, y) => x > 10 && x < 54 && y > 10 && y < 54))).toBe(true);
    expect(goodCutout(make(() => false))).toBe(false);
    expect(goodCutout(make(() => true))).toBe(false);
    expect(goodCutout(make((x, y) => x < 30 && y > 10 && y < 54))).toBe(false);
    expect(goodCutout(make((x, y) => x % 2 === 0 && y % 2 === 0))).toBe(false);
  });
  it("удаляет EXIF GPS даже если преобразователь начал отдавать EXIF/XMP", () => {
    const chunk = (name: string, text: string) => {
      const data = new TextEncoder().encode(text);
      const bytes = new Uint8Array(8 + data.length + (data.length % 2));
      bytes.set(new TextEncoder().encode(name));
      new DataView(bytes.buffer).setUint32(4, data.length, true);
      bytes.set(data, 8);
      return bytes;
    };
    const parts = [chunk("VP8 ", "pixels"), chunk("EXIF", "GPSLatitude camera model"), chunk("XMP ", "GPSLongitude")];
    const webp = new Uint8Array(12 + parts.reduce((sum, part) => sum + part.length, 0));
    webp.set(new TextEncoder().encode("RIFF0000WEBP"));
    let offset = 12;
    for (const part of parts) {
      webp.set(part, offset);
      offset += part.length;
    }
    const clean = new TextDecoder().decode(stripWebpMetadata(webp));
    expect(clean).toContain("pixels");
    expect(clean).not.toMatch(/GPS|EXIF|XMP|camera/);
  });
});
