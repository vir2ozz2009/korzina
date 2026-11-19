import { useParams } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Header } from "../../../app/shell/Header";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { Screen } from "../../../app/shell/Screen";
import { errorKind } from "../../../shared/http-error";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { useAdminShop } from "../api";
import { AdminAccessError } from "./AdminAccessError";
import { AdminOwner } from "./AdminOwner";
import { AdminShopActions, AdminShopExtras } from "./AdminShopActions";
import { AdminShopBot } from "./AdminShopBot";
import { AdminShopData } from "./AdminShopData";
import { AdminStatus } from "./Status";

export function AdminShopScreen() {
  const { id } = useParams({ from: "/admin/shops/$id" });
  const query = useAdminShop(id);
  return (
    <Screen template="order" header={<Header title="Магазин" actions={null} />}>
      {query.isError && errorKind(query.error) === "access" ? (
        <AdminAccessError returnToRegistry />
      ) : (
        <QueryBoundary query={query} template="order">
          {(shop) => (
            <>
              <Card size="lg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-title-2">{shop.name}</h2>
                  <AdminStatus status={shop.status} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-all text-caption text-muted-foreground">{shop.slug}.korzina.app</p>
                  <Button
                    variant="secondary"
                    icon={<ExternalLink size={17} />}
                    onClick={() => location.assign(shop.storefrontUrl)}
                  >
                    Открыть
                  </Button>
                </div>
              </Card>
              <AdminShopActions shop={shop} />
              <AdminOwner shop={shop} />
              <AdminShopBot shop={shop} />
              <AdminShopData shop={shop} />
              <AdminShopExtras shop={shop} />
            </>
          )}
        </QueryBoundary>
      )}
    </Screen>
  );
}
