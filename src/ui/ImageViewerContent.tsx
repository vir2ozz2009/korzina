import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { IconButton } from "./IconButton";
import { imageSource, type ProductImageValue } from "./product-image";

export function ImageViewerContent({
  images,
  index,
  name,
  onIndexChange,
  onClose,
}: {
  images: readonly ProductImageValue[];
  index: number;
  name: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const selected = imageSource(images[index]);
  const original = selected.original ?? selected;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto grid h-dvh max-h-dvh w-screen max-w-none grid-rows-[auto_minmax(0,1fr)_auto] bg-inverse p-3 text-inverse-foreground backdrop:bg-inverse"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="text-label">
          {name} · {index + 1}/{images.length}
        </h3>
        <IconButton aria-label="Закрыть фото" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-150 overflow-hidden">
        <TransformWrapper key={index} minScale={1} maxScale={4} doubleClick={{ mode: "toggle" }}>
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <img
                  src={original.src}
                  srcSet={original.srcSet}
                  sizes="(max-width: 624px) calc(100vw - 24px), 600px"
                  alt={name}
                  draggable={false}
                  className="size-full object-contain object-center"
                />
              </TransformComponent>
              <div className="absolute inset-x-0 bottom-16 flex justify-center gap-2">
                <IconButton aria-label="Уменьшить фото" onClick={() => zoomOut()}>
                  <Minus />
                </IconButton>
                <IconButton aria-label="Масштаб по размеру экрана" onClick={() => resetTransform()}>
                  <RotateCcw />
                </IconButton>
                <IconButton aria-label="Увеличить фото" onClick={() => zoomIn()}>
                  <Plus />
                </IconButton>
              </div>
            </>
          )}
        </TransformWrapper>
      </div>
      <div className="flex justify-center gap-4">
        <IconButton aria-label="Предыдущее фото" disabled={index === 0} onClick={() => onIndexChange(index - 1)}>
          <ChevronLeft />
        </IconButton>
        <IconButton
          aria-label="Следующее фото"
          disabled={index === images.length - 1}
          onClick={() => onIndexChange(index + 1)}
        >
          <ChevronRight />
        </IconButton>
      </div>
    </dialog>
  );
}
