import type { CSSProperties } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { resolveTheme, validateCustomColor } from "../../../../shared/theme-presets";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { ListItem } from "../../../../ui/ListItem";
import { ThemePicker } from "../../../../ui/ThemePicker";
import { type ThemeData, useSellerSetting } from "../../settings-api";
import { SettingsEditor, type SettingsFrame } from "./SettingsEditor";

const path = "profile/theme";
export function ShopThemeSettings({
  store,
  frame,
  storefrontUrl,
}: {
  store: string;
  frame: SettingsFrame;
  storefrontUrl: string;
}) {
  const query = useSellerSetting<ThemeData>(store, path);
  return (
    <QueryBoundary query={query} template="form">
      {(data) => (
        <SettingsEditor
          store={store}
          frame={frame}
          path={path}
          data={data}
          select={({ theme }) => ({ theme })}
          valid={({ theme }) => !("custom" in theme) || validateCustomColor(theme.custom).ok}
        >
          {(value, change, disabled) => (
            <>
              <Card>
                <ThemePicker
                  key={JSON.stringify(data.theme)}
                  initial={value.theme}
                  onChange={(theme) => change({ theme })}
                  onInvalidCustom={(custom) => change({ theme: { custom } })}
                  applyToPage={false}
                />
              </Card>
              <Card style={resolveTheme(value.theme) as CSSProperties}>
                <h2 className="text-title-3">Предпросмотр</h2>
                <ListItem
                  title="Пример товара"
                  value={<span className="rounded-pill bg-primary-soft px-3 py-1 text-primary-text">1</span>}
                />
                <Button full>Корзина</Button>
              </Card>
              <ListItem title="Посмотреть на витрине" href={disabled && data.canWrite ? undefined : storefrontUrl} />
            </>
          )}
        </SettingsEditor>
      )}
    </QueryBoundary>
  );
}
