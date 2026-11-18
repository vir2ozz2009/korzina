import { Heart } from "lucide-react";
import { useToast } from "../../../app/shell/ToastProvider";
import images from "../../../shared/demo-images.json";
import { Unfinished } from "../../../ui/Unfinished";

const storyImages = [
  images["demo-croissant"],
  images["demo-pancake"],
  images["demo-milk"],
  images["demo-curd"],
  images["demo-berry"],
  images["demo-strawberry"],
];

export function HomeUnfinished() {
  const notify = useToast();
  return (
    <div className="space-y-3">
      <Unfinished notify={notify} task="A3 · Истории">
        {(onClick) => (
          <fieldset aria-label="Истории" className="flex gap-2 overflow-x-auto">
            {storyImages.map((photo, index) => (
              <button
                key={photo.src}
                type="button"
                className={`size-11 shrink-0 rounded-full border-2 bg-card p-0.5 ${index === 3 ? "border-border" : "border-primary"}`}
                aria-label={`История ${index + 1}`}
                onClick={onClick}
              >
                <img src={photo.src} loading="lazy" alt="" className="size-full rounded-full object-contain" />
              </button>
            ))}
          </fieldset>
        )}
      </Unfinished>
      <Unfinished notify={notify} task="A5 · Любимый товар">
        {(onClick) => (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl bg-card p-3 text-left text-label"
            onClick={onClick}
          >
            <Heart size={18} fill="currentColor" className="shrink-0 text-primary-text" />
            <span>Любимый товар</span>
            <span className="text-primary-text">−10%</span>
            <span className="ml-auto whitespace-nowrap text-primary-text">Выбрать ›</span>
          </button>
        )}
      </Unfinished>
    </div>
  );
}
