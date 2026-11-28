import { useNavigate } from "@tanstack/react-router";
import { CatalogTemplate } from "../../../app/templates/CatalogTemplate";
import { BrandTile } from "../../../ui/BrandTile";
import { Button } from "../../../ui/Button";
import { CategoryTile } from "../../../ui/CategoryTile";
import { useProductList } from "../list-api";
import { CatalogTabs } from "./CatalogTabs";

export function NavigationScreen({ brands = false }: { brands?: boolean }) {
  const query = useProductList("all");
  const document = query.data?.pages[0];
  const navigate = useNavigate();
  const categories = document?.categories.filter((item) => !item.parentId && item.hasProducts) ?? [];
  const items = document?.brands.filter((item) => item.hasProducts) ?? [];
  return (
    <CatalogTemplate
      title={brands ? "Бренды" : "Все категории"}
      layout="list"
      toolbar={<CatalogTabs active={brands ? "/brands" : "/categories"} />}
      state={{
        query,
        empty: brands ? !items.length : !categories.length,
        emptyTitle: "Здесь пока пусто",
        emptyDescription: "",
        onEmpty: () => void navigate({ to: "/" }),
      }}
    >
      {!brands && (
        <Button full onClick={() => void navigate({ to: "/catalog", replace: true })}>
          Все товары ›
        </Button>
      )}
      <div className="grid grid-cols-2 gap-3">
        {brands
          ? items.map((item) => (
              <div key={item.id} className="flex justify-center">
                <BrandTile
                  name={item.name}
                  logo={typeof item.image === "string" ? item.image : item.image?.src}
                  href={`/b/${encodeURIComponent(item.id)}`}
                />
              </div>
            ))
          : categories.map((item) => (
              <div key={item.id} className="min-w-0">
                <CategoryTile
                  list
                  name={item.name}
                  image={item.image ?? undefined}
                  href={`/c/${encodeURIComponent(item.id)}`}
                />
              </div>
            ))}
      </div>
      {!brands && !!items.length && (
        <Button full variant="secondary" onClick={() => void navigate({ to: "/brands", replace: true })}>
          Все бренды ›
        </Button>
      )}
    </CatalogTemplate>
  );
}
export function BrandsScreen() {
  return <NavigationScreen brands />;
}
