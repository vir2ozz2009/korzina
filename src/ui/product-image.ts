export interface ImageSource {
  src: string;
  srcSet?: string;
}
export interface ProductImageSource extends ImageSource {
  original?: ImageSource;
}
export type ProductImageValue = string | ProductImageSource;

export function imageSource(image?: ProductImageValue): ProductImageSource {
  return typeof image === "string" ? { src: image } : (image ?? { src: "" });
}
