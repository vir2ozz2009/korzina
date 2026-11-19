import { Heart } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { useFavorites } from "./FavoritesProvider";

export function FavoriteButton({ id }: { id: string }) {
  const favorites = useFavorites();
  if (!favorites) return null;
  const selected = favorites.selected.has(id);
  return (
    <IconButton
      aria-label={selected ? "Убрать из избранного" : "Добавить в избранное"}
      aria-pressed={selected}
      disabled={!!favorites.pending || favorites.merging}
      onClick={() => favorites.select(id, !selected)}
    >
      <Heart size={22} className={selected ? "fill-primary text-primary" : undefined} />
    </IconButton>
  );
}
