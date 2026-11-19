import { type PointerEvent, useLayoutEffect, useRef, useState } from "react";
import type { CropPosition } from "../../../shared/contracts/media";
import { Button } from "../../../ui/Button";
import { type CategorySize, CategoryTile } from "../../../ui/CategoryTile";
import { Chip } from "../../../ui/Chip";
import { ProductImage } from "../../../ui/ProductImage";
import { photoPercent } from "../../../ui/product-image";

const center = { x: 0.5, y: 0.5 };
const sizes: CategorySize[] = ["1x1", "2x1", "1x2", "2x2"];
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function PhotoCropEditor({
  src,
  name,
  position,
  onChange,
  disabled,
}: {
  src: string;
  name: string;
  position: CropPosition;
  onChange: (position: CropPosition) => void;
  disabled?: boolean;
}) {
  const [target, setTarget] = useState<"product" | "category">("product");
  const [size, setSize] = useState<CategorySize>("1x1");
  const [photo, setPhoto] = useState<{ width: number; height: number }>();
  const [categoryRatio, setCategoryRatio] = useState(1);
  const preview = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; position: CropPosition } | null>(null);
  const category = target === "category";
  const ratio = category ? categoryRatio : 1;
  const photoRatio = photo ? photo.width / photo.height : ratio;
  const width = Math.min(1, ratio / photoRatio);
  const height = Math.min(1, photoRatio / ratio);

  useLayoutEffect(() => {
    if (!category) return;
    const frame = preview.current?.querySelector("[data-category-photo]");
    if (!frame) return;
    const observer = new ResizeObserver(([{ contentRect: rect }]) => {
      if (rect.height > 0 && rect.width > 0) setCategoryRatio(rect.width / rect.height);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [category]);

  function move(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || !drag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const start = drag.current;
    onChange({
      x: width < 1 ? clamp(start.position.x + (event.clientX - start.x) / (rect.width * (1 - width))) : position.x,
      y: height < 1 ? clamp(start.position.y + (event.clientY - start.y) / (rect.height * (1 - height))) : position.y,
    });
  }

  const image = { src, cropPosition: position };
  return (
    <div className="space-y-3">
      <fieldset className="flex gap-2" aria-label="Настройка фото">
        <Chip selected={!category} onClick={() => setTarget("product")}>
          Товар
        </Chip>
        <Chip selected={category} onClick={() => setTarget("category")}>
          Категория
        </Chip>
      </fieldset>
      {category ? (
        <label className="flex items-center gap-3 text-label">
          Трафарет
          <select
            className="min-h-11 rounded-sm bg-input px-3"
            value={size}
            onChange={(event) => setSize(event.target.value as CategorySize)}
          >
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size.replace("x", "×")}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-small text-muted-foreground">Квадрат 1:1 для главной, списка категории, галереи и корзины</p>
      )}
      <div className="flex justify-center rounded-md bg-input p-2">
        <button
          type="button"
          disabled={disabled}
          aria-label="Положение кадра. Используйте клавиши со стрелками."
          className="relative max-w-full touch-none cursor-grab overflow-hidden rounded-sm active:cursor-grabbing"
          style={{ width: photo ? Math.min(photo.width, 300 * photoRatio) : "100%" }}
          onPointerDown={(event) => {
            if (disabled || !photo || event.button !== 0 || (width === 1 && height === 1)) return;
            drag.current = { x: event.clientX, y: event.clientY, position };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={move}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            const offsets = { ArrowLeft: [-0.04, 0], ArrowRight: [0.04, 0], ArrowUp: [0, -0.04], ArrowDown: [0, 0.04] };
            const offset = offsets[event.key as keyof typeof offsets];
            if (disabled || !photo || !offset) return;
            event.preventDefault();
            onChange({
              x: width < 1 ? clamp(position.x + offset[0]) : position.x,
              y: height < 1 ? clamp(position.y + offset[1]) : position.y,
            });
          }}
        >
          <img
            className="pointer-events-none block w-full"
            src={src}
            alt="Исходное фото"
            draggable={false}
            onLoad={({ currentTarget }) =>
              setPhoto({ width: currentTarget.naturalWidth, height: currentTarget.naturalHeight })
            }
          />
          <span
            aria-hidden
            className="pointer-events-none absolute border-2 border-card shadow-[0_0_0_100vmax_var(--photo-crop-shade)]"
            style={{
              width: photoPercent(width),
              height: photoPercent(height),
              left: photoPercent((1 - width) * position.x),
              top: photoPercent((1 - height) * position.y),
            }}
          />
        </button>
      </div>
      <p className="text-small text-muted-foreground">Перетащите рамку, чтобы выбрать видимую часть фото.</p>
      <section ref={preview} className="flex flex-wrap items-start gap-3" aria-label="Предпросмотр кадра">
        {category ? (
          <div
            style={{
              width: size.startsWith("2") ? 219 : 105,
              height: size.endsWith("2") ? 219 : 105,
            }}
          >
            <CategoryTile name="Ваша категория" size={size} image={image} />
          </div>
        ) : (
          <ProductImage {...image} alt={name} className="w-28" />
        )}
      </section>
      <Button variant="secondary" onClick={() => onChange(center)} disabled={disabled}>
        По центру
      </Button>
    </div>
  );
}
