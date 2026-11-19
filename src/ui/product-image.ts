interface ImageSource {
  src: string;
  srcSet?: string;
}

import type { ContentBox, CropPosition } from "../shared/contracts/media";
export interface ProductImageSource extends ImageSource {
  contentBox?: ContentBox;
  cropPosition?: CropPosition;
  width?: number;
  height?: number;
  edgeColor?: string;
  original?: ImageSource;
}
export type ProductImageValue = string | ProductImageSource;

export function imageSource(image?: ProductImageValue): ProductImageSource {
  return typeof image === "string" ? { src: image } : (image ?? { src: "" });
}

export const photoPercent = (fraction: number) => `${fraction * 100}%`;

export function imagePosition(position?: CropPosition) {
  return position ? `${photoPercent(position.x)} ${photoPercent(position.y)}` : "50% 50%";
}
