import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Header } from "../../../../app/shell/Header";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { Screen } from "../../../../app/shell/Screen";
import { SellerTabs } from "../../../../app/shell/SellerTabs";
import { sellerHistory } from "../../../../app/shell/tab-history";
import type { SellerGroupKind } from "../../../../shared/contracts/seller-catalog";
import { HttpError } from "../../../../shared/http-error";
import { Chip } from "../../../../ui/Chip";
import { EmptyState } from "../../../../ui/EmptyState";
import { IconButton } from "../../../../ui/IconButton";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import { useCabinet } from "../../api";
import { useCatalogAccess } from "../../catalog-api";
import { CabinetLogin } from "../CabinetLogin";
import type { CatalogFrame } from "./CatalogEditorFrame";
import { GroupRoute, ProductRoute } from "./CatalogEditorRoutes";
import { CatalogGroups } from "./CatalogGroups";
import { CatalogProducts } from "./CatalogProducts";
import { useCatalogNav } from "./navigation";
import { Showcase } from "./Showcase";

const sections = [
  ["products", "Товары"],
  ["categories", "Категории"],
  ["brands", "Бренды"],
] as const;

export function SellerCatalogScreen() {
  const nav = useCatalogNav();
  const params = nav.location.pathname.split("/");
  const section = sections.find(([name]) => name === params[2]);
  const type = section?.[0] ?? "showcase";
  const id = params[3] ? decodeURIComponent(params[3]) : undefined;
  const store = nav.params.get("store") ?? undefined;
  const scopedCategory = nav.params.get("category");
  const scopedBrand = nav.params.get("brand");
  const parent = nav.params.get("parent");
  const cabinet = useCabinet(store);
  const editor = Boolean(id) || type === "showcase";
  const currentHref = nav.location.href;
  useEffect(() => {
    sellerHistory.visit(currentHref);
  }, [currentHref]);
  const [shops, setShops] = useState(false);
  const tried = useRef(false);
  const login = cabinet.error instanceof HttpError && cabinet.error.status === 401;
  const denied = cabinet.error instanceof HttpError && cabinet.error.status === 403;
  const title =
    type === "showcase"
      ? "Витрина"
      : !id
        ? (section?.[1] ?? "Товары")
        : type === "products"
          ? id === "new"
            ? "Новый товар"
            : "Редактировать товар"
          : type === "categories"
            ? id === "new"
              ? "Новая категория"
              : "Редактировать категорию"
            : id === "new"
              ? "Новый бренд"
              : "Редактировать бренд";

  const frame: CatalogFrame = (children, footer) => (
    <div className={editor ? "[--tab-height:0]" : undefined}>
      <Screen
        template={id || type === "showcase" ? "form" : "list"}
        header={
          <>
            <Header
              catalog
              title={
                login
                  ? "Вход"
                  : scopedCategory && !id
                    ? "Товары категории"
                    : scopedBrand && !id
                      ? "Товары бренда"
                      : parent && !id
                        ? "Подкатегории"
                        : title
              }
              onBack={
                !id && (scopedCategory || scopedBrand || parent)
                  ? () => {
                      if (scopedCategory || parent)
                        nav.leave(`/seller/categories/${encodeURIComponent(scopedCategory ?? parent ?? "")}`);
                      else nav.leave(`/seller/brands/${encodeURIComponent(scopedBrand ?? "")}`);
                    }
                  : undefined
              }
              actions={
                cabinet.data && cabinet.data.shops.length > 1 ? (
                  <IconButton aria-label="Выбрать магазин" onClick={() => setShops(true)}>
                    <ChevronDown size={20} />
                  </IconButton>
                ) : undefined
              }
            />
            {!id && section && !nav.params.get("parent") && !nav.params.get("category") && !nav.params.get("brand") && (
              <fieldset
                aria-label="Разделы каталога"
                className="grid grid-cols-3 gap-2 border-b border-border bg-card px-3 pt-1 pb-4"
              >
                {sections.map(([name, label]) => (
                  <Chip
                    key={name}
                    selected={type === name}
                    onClick={() => nav.open(`/seller/${name}`, { store: cabinet.data?.current?.slug ?? store })}
                  >
                    {label}
                  </Chip>
                ))}
              </fieldset>
            )}
          </>
        }
        after={
          !editor &&
          cabinet.data?.current &&
          !cabinet.isError && (
            <SellerTabs store={cabinet.data.current.slug} permissions={cabinet.data.current.permissions} />
          )
        }
        footer={footer}
      >
        {children}
        {shops && cabinet.data && (
          <Sheet open title="Магазины" onOpenChange={setShops}>
            {cabinet.data.shops.map((shop) => (
              <ListItem
                key={shop.id}
                title={shop.name}
                subtitle={shop.storefrontUrl}
                onClick={() => {
                  setShops(false);
                  nav.open(type === "showcase" ? "/seller/showcase" : `/seller/${type}`, { store: shop.slug });
                }}
              />
            ))}
          </Sheet>
        )}
      </Screen>
    </div>
  );

  if (login)
    return frame(<CabinetLogin store={store} ready={() => void cabinet.refetch()} automaticLoginAttempted={tried} />);
  if (denied)
    return frame(
      <EmptyState title="Нет доступа к каталогу" action="Мои магазины" onAction={() => nav.open("/seller")} />,
    );
  if (!cabinet.data?.current)
    return frame(
      <QueryBoundary query={cabinet} template="list">
        {() => <EmptyState title="Магазин недоступен" />}
      </QueryBoundary>,
    );
  const current = cabinet.data.current;
  return (
    <CatalogContent
      key={`${current.slug}:${type}:${id ?? ""}`}
      store={current.slug}
      storefront={current.storefrontUrl}
      account={cabinet.data.telegramId}
      canReadSales={current.role === "owner" || current.permissions.includes("payments")}
      type={type}
      id={id}
      frame={frame}
    />
  );
}

function CatalogContent({
  store,
  id,
  type,
  frame,
  storefront,
  canReadSales,
  account,
}: {
  store: string;
  type: "products" | SellerGroupKind | "showcase";
  id?: string;
  frame: CatalogFrame;
  storefront: string;
  canReadSales: boolean;
  account: string;
}) {
  const access = useCatalogAccess(store);
  const visible = access.data;
  if (!visible || access.isError)
    return frame(
      <QueryBoundary query={access} template="list">
        {() => null}
      </QueryBoundary>,
    );
  const { currency, canWrite } = visible;
  const withAccess: CatalogFrame = (children, footer) =>
    frame(
      <>
        {!canWrite && type !== "showcase" && <p className="text-meta text-muted-foreground">Только просмотр</p>}
        {children}
      </>,
      canWrite ? footer : undefined,
    );
  if (type === "showcase") return <Showcase store={store} canWrite={canWrite} frame={withAccess} />;
  if (type === "products")
    return id ? (
      <ProductRoute
        key={`${store}:${id}`}
        store={store}
        id={id}
        currency={currency}
        canWrite={canWrite}
        storefront={storefront}
        frame={withAccess}
      />
    ) : (
      <CatalogProducts
        store={store}
        currency={currency}
        canWrite={canWrite}
        canReadSales={canReadSales}
        account={account}
        frame={withAccess}
      />
    );
  return id ? (
    <GroupRoute store={store} id={id} kind={type} canWrite={canWrite} storefront={storefront} frame={withAccess} />
  ) : (
    <CatalogGroups store={store} kind={type} canWrite={canWrite} frame={withAccess} />
  );
}
