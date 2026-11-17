import { maxMediaBytes } from "../../../src/shared/contracts/media";
import { ApiError } from "../../../src/shared/errors";

export function detectContent(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf" {
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes[0] === 137 && ascii(1, 8) === "PNG\r\n\u001a\n") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8, 12))) return "image/heic";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  throw new ApiError("VALIDATION", "Выберите JPEG, PNG, WebP, HEIC или PDF");
}

export async function readUpload(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("Content-Length")) > maxMediaBytes)
    throw new ApiError("PAYLOAD_TOO_LARGE", "Размер файла после сжатия — до 10 МБ");
  if (!request.body) throw new ApiError("VALIDATION", "Выберите файл");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxMediaBytes) {
      await reader.cancel();
      throw new ApiError("PAYLOAD_TOO_LARGE", "Размер файла после сжатия — до 10 МБ");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
