const maxImageSide = 2048;
export function compressedSize(width: number, height: number) {
  const scale = Math.min(1, maxImageSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export async function prepareUpload(file: File): Promise<Blob> {
  const header = new TextDecoder().decode(await file.slice(0, 16).arrayBuffer());
  if (header.startsWith("%PDF-")) return file;
  // WASM is a separate asset and loads only when a HEIC is actually selected.
  const bitmap =
    header.slice(4, 8) === "ftyp"
      ? await (await import("./heic")).decodeHeic(file)
      : await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const size = compressedSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось подготовить фото");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сжать фото"))), "image/webp", 0.85),
    );
  } finally {
    bitmap.close();
  }
}
