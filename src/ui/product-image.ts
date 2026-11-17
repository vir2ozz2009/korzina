export type ProductImageDisplay = "cutout" | "photo";
export interface ImageSource {
  src: string;
  srcSet?: string;
}
export interface ProductImageSource extends ImageSource {
  display?: ProductImageDisplay;
  original?: ImageSource;
}
export type ProductImageValue = string | ProductImageSource;

export function imageSource(image?: ProductImageValue): ProductImageSource {
  return typeof image === "string" ? { src: image } : (image ?? { src: "" });
}
