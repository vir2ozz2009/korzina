import { useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Chip } from "../../../../ui/Chip";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import { type ReceivingHoursData, useSellerSetting } from "../../settings-api";
import { HoursFields } from "./HoursFields";

import { form, isValid } from "./hours-form";
import { SettingsEditor, type SettingsFrame } from "./SettingsEditor";

const path = "receiving/hours";
export function HoursSettings({ store, frame }: { store: string; frame: SettingsFrame }) {
  const query = useSellerSetting<ReceivingHoursData>(store, path);
  const [newDate, setNewDate] = useState("");
  return (
    <QueryBoundary query={query} template="form">
      {(data) => (
        <SettingsEditor
          path={path}
          store={store}
          data={data}
          select={form}
          frame={frame}
          valid={({ delivery, pickup }) => isValid(delivery) && (!pickup || isValid(pickup))}
        >
          {(value, change) => (
            <>
              <Card>
                <Switch
                  label="Разные часы для доставки и самовывоза"
                  checked={!!value.pickup}
                  onChange={(event) => change({ ...value, pickup: event.target.checked ? value.delivery : undefined })}
                />
              </Card>
              <HoursFields
                title={value.pickup ? "Доставка" : "Часы работы"}
                value={value.delivery}
                change={(delivery) => change({ ...value, delivery })}
              />
              {value.pickup && (
                <HoursFields title="Самовывоз" value={value.pickup} change={(pickup) => change({ ...value, pickup })} />
              )}
              <Card>
                <h2 className="text-title-3">Не работаем</h2>
                <div className="flex flex-wrap gap-2">
                  {value.closedDates.map((date) => (
                    <Chip
                      key={date}
                      onClick={() =>
                        change({
                          ...value,
                          closedDates: value.closedDates.filter((item) => item !== date),
                        })
                      }
                      aria-label={`Убрать выходной ${date}`}
                    >
                      {date} ×
                    </Chip>
                  ))}
                </div>
                <Input
                  type="date"
                  label="Выходная дата"
                  value={newDate}
                  onChange={(event) => setNewDate(event.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={!newDate || value.closedDates.includes(newDate)}
                  onClick={() => {
                    change({ ...value, closedDates: [...value.closedDates, newDate].sort() });
                    setNewDate("");
                  }}
                >
                  Добавить дату
                </Button>
              </Card>
            </>
          )}
        </SettingsEditor>
      )}
    </QueryBoundary>
  );
}
