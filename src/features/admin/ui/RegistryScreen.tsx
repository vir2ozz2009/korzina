import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, Plus, X } from "lucide-react";
import { useState } from "react";
import { Header } from "../../../app/shell/Header";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { Screen } from "../../../app/shell/Screen";
import { errorKind } from "../../../shared/http-error";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { useRegistry } from "../api";
import { AdminAccessError } from "./AdminAccessError";
import { CreateDraftForm } from "./CreateDraftForm";
import { AdminStatus } from "./Status";

export function RegistryScreen() {
  const query = useRegistry();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  return (
    <Screen template="list" header={<Header title="Админка" actions={null} />}>
      {query.isError && errorKind(query.error) === "access" ? (
        <AdminAccessError />
      ) : (
        <QueryBoundary query={query} template="list">
          {(shops) => (
            <>
              <Button
                full
                size="lg"
                aria-expanded={expanded}
                icon={<Plus size={19} />}
                onClick={() => setExpanded(!expanded)}
              >
                Создать магазин
              </Button>
              {expanded && <CreateDraftForm />}
              {!shops.length && (
                <Card>
                  <EmptyState title="Создайте первый магазин" />
                </Card>
              )}
              {shops.map((shop) => (
                <button
                  key={shop.id}
                  type="button"
                  className="w-full rounded-xl bg-card p-4 text-left"
                  onClick={() =>
                    void navigate({
                      to: "/admin/shops/$id",
                      params: { id: shop.id },
                      search: (previous) => ({ shop: previous.shop }),
                    })
                  }
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-title-3">{shop.name}</h2>
                      <p className="break-all text-caption text-muted-foreground">{shop.storefrontUrl}</p>
                    </div>
                    <AdminStatus status={shop.status} />
                    <ChevronRight size={19} className="shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-caption">
                    <span className="inline-flex items-center gap-1">
                      Бот{" "}
                      {shop.botConnected ? (
                        <Check size={15} aria-label="подключён" />
                      ) : (
                        <X size={15} aria-label="не подключён" />
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {shop.ownerAccepted ? (
                        <>
                          Владелец <Check size={15} aria-label="назначен" />
                        </>
                      ) : (
                        "ждём владельца"
                      )}
                    </span>
                  </div>
                  <p className="mt-3 text-small text-muted-foreground">Заказы за 7 дней · {shop.orders7d}</p>
                </button>
              ))}
            </>
          )}
        </QueryBoundary>
      )}
    </Screen>
  );
}
