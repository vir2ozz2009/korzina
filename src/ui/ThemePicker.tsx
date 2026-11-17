import { useId, useState } from "react";
import { applyTheme } from "../shared/apply-theme";
import {
  CUSTOM_PREVIEW_COLOR,
  HEX_RE,
  isLightAccent,
  type ShopTheme,
  THEME_PRESETS,
  validateCustomColor,
} from "../shared/theme-presets";

export function ThemePicker({ initial, onChange }: { initial: ShopTheme; onChange: (theme: ShopTheme) => void }) {
  const id = useId();
  const [selected, setSelected] = useState(initial);
  const [custom, setCustom] = useState("custom" in initial ? initial.custom : CUSTOM_PREVIEW_COLOR);
  const [error, setError] = useState("");
  function choose(theme: ShopTheme) {
    setSelected(theme);
    applyTheme(theme);
    onChange(theme);
    setError("");
  }
  function chooseCustom(value: string) {
    setCustom(value);
    const result = validateCustomColor(value);
    if (!result.ok) {
      setError(
        result.reason === "too_light"
          ? "Цвет слишком светлый. Выберите более насыщенный."
          : "Введите цвет в формате #rrggbb.",
      );
      return;
    }
    choose({ custom: value });
  }
  return (
    <div className="space-y-4">
      <fieldset className="grid grid-cols-3 gap-2" aria-label="Пресеты оформления">
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={"preset" in selected && selected.preset === preset.id}
            onClick={() => choose({ preset: preset.id })}
            className="flex min-h-(--control-md) items-center justify-center rounded-pill bg-secondary px-2 text-caption text-secondary-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {preset.name}
          </button>
        ))}
      </fieldset>
      <div className="space-y-2">
        <label htmlFor={id} className="block text-label">
          Свой цвет
        </label>
        <div className="flex gap-2">
          <input
            aria-label="Выбрать цвет из палитры"
            type="color"
            value={HEX_RE.test(custom) ? custom : CUSTOM_PREVIEW_COLOR}
            onChange={(event) => chooseCustom(event.target.value)}
            className="h-(--control-md) w-(--control-lg) cursor-pointer rounded-sm border border-border bg-card p-1"
          />
          <input
            id={id}
            value={custom}
            spellCheck={false}
            maxLength={7}
            aria-invalid={!!error}
            aria-describedby={`${id}-hint`}
            onChange={(event) => chooseCustom(event.target.value)}
            className="min-w-0 flex-1 rounded-pill bg-input px-4 text-body"
          />
        </div>
        <p
          id={`${id}-hint`}
          role="status"
          className={error ? "text-small text-status-danger-foreground" : "text-small text-muted-foreground"}
        >
          {error ||
            ("custom" in selected && isLightAccent(selected.custom)
              ? "На светлой кнопке текст автоматически станет тёмным."
              : "Предпросмотр на этой странице. Настройки магазина не меняются.")}
        </p>
      </div>
    </div>
  );
}
