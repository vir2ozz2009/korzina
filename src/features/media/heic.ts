import create, { type HeifModule } from "libheif-js/libheif-wasm/libheif.js";
import wasmUrl from "libheif-js/libheif-wasm/libheif.wasm?url";

async function initialize() {
  // This distribution instantiates synchronously. Preload its versioned asset
  // so the codec never attempts a synchronous browser request.
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error("Не удалось загрузить обработчик HEIC. Попробуйте ещё раз");
  const wasmBinary = new Uint8Array(await response.arrayBuffer());
  return new Promise<HeifModule>((resolve, reject) => {
    create({
      wasmBinary,
      locateFile: () => wasmUrl,
      onRuntimeInitialized() {
        resolve(this);
      },
      onAbort: () => reject(new Error("Не удалось открыть HEIC")),
    });
  });
}
let decoder: Promise<HeifModule> | undefined;

export async function decodeHeic(file: Blob): Promise<ImageBitmap> {
  decoder ??= initialize().catch((error: unknown) => {
    decoder = undefined;
    throw error;
  });
  const module = await decoder;
  const instance = new module.HeifDecoder();
  const images = instance.decode(new Uint8Array(await file.arrayBuffer()));
  try {
    const image = images[0];
    if (!image) throw new Error("Не удалось открыть HEIC");
    const width = image.get_width();
    const height = image.get_height();
    if (width * height > 40_000_000) throw new Error("Фото должно быть не больше 40 мегапикселей");
    const data = new ImageData(width, height);
    await new Promise<void>((resolve, reject) =>
      image.display(data, (result) => (result ? resolve() : reject(new Error("Не удалось открыть HEIC")))),
    );
    return await createImageBitmap(data);
  } finally {
    for (const image of images) image.free();
    if (instance.decoder) module.heif_context_free(instance.decoder);
  }
}
