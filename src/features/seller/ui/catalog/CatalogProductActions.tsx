import type { SellerProductRow } from "../../../../shared/contracts/seller-catalog";
import { Button } from "../../../../ui/Button";
import { Switch } from "../../../../ui/Switch";

export function CatalogProductActions({
  row,
  disabled,
  canWrite,
  sale,
  show,
  statistics,
}: {
  row: SellerProductRow;
  disabled: boolean;
  canWrite: boolean;
  sale: () => void;
  show: () => void;
  statistics?: () => void;
}) {
  if (!canWrite && !statistics) return null;
  return (
    <div
      className={`border-t border-border px-3 ${statistics ? "flex flex-wrap items-center justify-between gap-x-2" : ""}`}
    >
      {statistics && (
        <Button variant="ghost" className="px-0" aria-label={`Статистика продаж: ${row.name}`} onClick={statistics}>
          Статистика продаж
        </Button>
      )}
      {canWrite &&
        (row.status === "hidden" ? (
          <div className="flex justify-end py-1">
            <Button variant="secondary" disabled={disabled} onClick={show}>
              Показать
            </Button>
          </div>
        ) : (
          <Switch
            label="Наличие"
            aria-label={`В продаже: ${row.name}`}
            checked={row.status === "selling"}
            disabled={disabled}
            onChange={sale}
          />
        ))}
    </div>
  );
}
