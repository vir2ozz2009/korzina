import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import { ProductImage } from "./ProductImage";
export function Gallery({ images, name }: { images: readonly string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (expanded) element?.showModal();
    else element?.close();
    setZoom(false);
  }, [expanded]);
  function move(next: number) {
    const bounded = Math.max(0, Math.min(images.length - 1, next));
    setIndex(bounded);
    rail.current?.scrollTo({
      left: bounded * rail.current.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }
  if (!images.length) return <ProductImage alt={name} className="aspect-square w-full" />;
  return (
    <div className="relative">
      <div
        ref={rail}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl"
        onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}
      >
        {images.map((image, i) => (
          <button
            type="button"
            key={image}
            className="aspect-square w-full shrink-0 snap-center overflow-hidden"
            aria-label={`Открыть фото ${i + 1}: ${name}`}
            onClick={() => setExpanded(true)}
          >
            <ProductImage src={image} alt={`${name}, фото ${i + 1}`} className="size-full" />
          </button>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-2 flex justify-center">
        <fieldset
          aria-label={`Фото ${index + 1} из ${images.length}`}
          className="flex min-h-6 gap-1 rounded-pill bg-card px-3"
        >
          {images.map((image, i) => (
            <button
              key={image}
              type="button"
              aria-label={`Фото ${i + 1}`}
              aria-current={index === i ? "true" : undefined}
              onClick={() => move(i)}
              className="flex min-h-11 min-w-6 items-center justify-center"
            >
              <span className={`size-1.5 rounded-pill ${index === i ? "bg-primary" : "bg-border"}`} />
            </button>
          ))}
        </fieldset>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby={id}
        onCancel={(event) => {
          event.preventDefault();
          setExpanded(false);
        }}
        className="fixed inset-0 m-auto h-dvh max-h-dvh w-screen max-w-none bg-inverse p-3 text-inverse-foreground backdrop:bg-inverse"
      >
        <div className="flex items-center justify-between">
          <h3 id={id} className="text-label">
            {name} · {index + 1}/{images.length}
          </h3>
          <IconButton aria-label="Закрыть фото" onClick={() => setExpanded(false)}>
            <X />
          </IconButton>
        </div>
        <div className="flex h-[75dvh] items-center justify-center overflow-auto">
          <img
            src={images[index]}
            alt={name}
            className={`max-h-full object-contain transition-transform motion-reduce:transition-none ${zoom ? "scale-150" : ""}`}
          />
        </div>
        <div className="flex justify-center gap-4">
          <IconButton aria-label="Предыдущее фото" disabled={index === 0} onClick={() => move(index - 1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton aria-label={zoom ? "Уменьшить фото" : "Увеличить фото"} onClick={() => setZoom(!zoom)}>
            {zoom ? <Minus /> : <Plus />}
          </IconButton>
          <IconButton
            aria-label="Следующее фото"
            disabled={index === images.length - 1}
            onClick={() => move(index + 1)}
          >
            <ChevronRight />
          </IconButton>
        </div>
      </dialog>
    </div>
  );
}
