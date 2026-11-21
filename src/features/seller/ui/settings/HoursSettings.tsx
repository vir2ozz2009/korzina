import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { defaultShopTimeZone, shopDateTime } from "../../../../shared/datetime";
import { Button } from "../../../../ui/Button";
import { type ReceivingHoursData, useSellerSetting } from "../../settings-api";
import { ClosedDates } from "./ClosedDates";
import { HoursFields } from "./HoursFields";
import { form, isValid, suggestsSave } from "./hours-form";
import { SettingsEditor, type SettingsFrame } from "./SettingsEditor";

const path = "receiving/hours";
export function HoursSettings({ store, frame }: { store: string; frame: SettingsFrame }) {
  const query = useSellerSetting<ReceivingHoursData>(store, path);
  return (
    <QueryBoundary query={query} template="form">
      {(data) => (
        <SettingsEditor
          path={path}
          store={store}
          data={data}
          select={form}
          suggestSave={suggestsSave(data)}
          frame={frame}
          valid={({ delivery, pickup }) => isValid(delivery) && (!pickup || isValid(pickup))}
        >
          {(value, change, disabled) => (
            <>
              <HoursFields
                title={value.pickup ? "Когда принимаете доставку" : "Когда принимаете заказы"}
                value={value.delivery}
                change={(delivery) => change({ ...value, delivery })}
                extra={
                  !value.pickup && (
                    <Button variant="ghost" onClick={() => change({ ...value, pickup: value.delivery })}>
                      Для самовывоза другие часы <span aria-hidden>›</span>
                    </Button>
                  )
                }
              />
              {value.pickup && (
                <HoursFields
                  title="Самовывоз"
                  value={value.pickup}
                  change={(pickup) => change({ ...value, pickup })}
                  extra={
                    <Button variant="ghost" onClick={() => change({ ...value, pickup: undefined })}>
                      Общие часы для самовывоза <span aria-hidden>›</span>
                    </Button>
                  }
                />
              )}
              <ClosedDates
                today={shopDateTime(Date.now(), data.timeZone ?? data.schedule?.timeZone ?? defaultShopTimeZone).date}
                dates={value.closedDates}
                disabled={disabled}
                change={(closedDates) => change({ ...value, closedDates })}
              />
            </>
          )}
        </SettingsEditor>
      )}
    </QueryBoundary>
  );
}
