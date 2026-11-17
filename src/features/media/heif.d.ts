declare module "libheif-js/libheif-wasm/libheif.js" {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(data: ImageData, callback: (data: ImageData | null) => void): void;
    free(): void;
  }
  export interface HeifModule {
    HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[]; decoder: number | null };
    heif_context_free(context: number): void;
  }
  export default function create(options: {
    locateFile: (name: string) => string;
    wasmBinary: Uint8Array;
    onRuntimeInitialized: (this: HeifModule) => void;
    onAbort: (reason: string) => void;
  }): HeifModule;
}
