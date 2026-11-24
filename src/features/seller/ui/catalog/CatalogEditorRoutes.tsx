import { useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import type { SellerGroupKind } from "../../../../shared/contracts/seller-catalog";
import { EmptyState } from "../../../../ui/EmptyState";
import { useCatalogGroups, useCatalogProduct } from "../../catalog-api";
import type { CatalogFrame } from "./CatalogEditorFrame";
import { GroupEditor } from "./GroupEditor";
import { ProductEditor } from "./ProductEditor";

type EditorRoute = { store: string; id: string; canWrite: boolean; storefront: string; frame: CatalogFrame };
export function ProductRoute({ id, frame, ...props }: EditorRoute & { currency: string }) {
  const query = useCatalogProduct(props.store, id === "new" ? undefined : id);
  // An editor takes its draft and revision from its first snapshot.
  const [needsRefresh] = useState(query.isStale);
  if (id === "new") return <ProductEditor {...props} frame={frame} />;
  if (query.data && !query.isError && (!needsRefresh || query.isFetchedAfterMount))
    return <ProductEditor {...props} frame={frame} initial={query.data} />;
  return frame(
    <QueryBoundary query={{ ...query, data: undefined, isPending: !query.isError }} template="form">
      {() => null}
    </QueryBoundary>,
  );
}
export function GroupRoute({ id, frame, kind, ...props }: EditorRoute & { kind: SellerGroupKind }) {
  const query = useCatalogGroups(props.store, kind);
  if (!query.data || query.isError)
    return frame(
      <QueryBoundary query={query} template="form">
        {() => null}
      </QueryBoundary>,
    );
  const group = query.data.groups.find((row) => row.id === id);
  if (id !== "new" && !group)
    return frame(<EmptyState title={kind === "categories" ? "Категория не найдена" : "Бренд не найден"} />);
  return <GroupEditor {...props} kind={kind} frame={frame} initial={group} groups={query.data.groups} />;
}
