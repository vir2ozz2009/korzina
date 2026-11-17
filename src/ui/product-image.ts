interface ImageSource {
  src: string;
  srcSet?: string;
}

import type { ContentBox } from "../shared/contracts/media";
export interface ProductImageSource extends ImageSource {
  contentBox?: ContentBox;
  width?: number;
  height?: number;
  edgeColor?: string;
  original?: ImageSource;
}
export type ProductImageValue = string | ProductImageSource;

export function imageSource(image?: ProductImageValue): ProductImageSource {
  return typeof image === "string" ? { src: image } : (image ?? { src: "" });
}
