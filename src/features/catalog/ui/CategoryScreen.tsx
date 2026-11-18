import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ProductList } from "./ProductList";

export function CategoryScreen() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { subcategory } = useSearch({ strict: false }) as { subcategory?: string };
  const navigate = useNavigate();
  return (
    <ProductList
      scope={`category:${subcategory ?? id}`}
      categoryId={id}
      onSelect={(value) =>
        void navigate({
          to: ".",
          search: (previous) => ({ ...previous, subcategory: value, variants: undefined }),
          replace: true,
          resetScroll: false,
        })
      }
    />
  );
}
