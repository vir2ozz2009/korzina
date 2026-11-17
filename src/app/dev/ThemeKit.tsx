import { useState } from "react";
import { DEFAULT_THEME, resolveTheme } from "../../shared/theme-presets";
import { ColorSwatch } from "../../ui/ColorSwatch";
import { KitSection } from "../../ui/KitSection";
import { ThemePicker } from "../../ui/ThemePicker";
import { bootstrap } from "../bootstrap";
import { Typography } from "./Typography";

export default function ThemeKit({ embedded = false }: { embedded?: boolean }) {
  const [theme, setTheme] = useState(bootstrap?.theme ?? DEFAULT_THEME);
  return (
    <div className={embedded ? "space-y-3" : "mx-auto max-w-(--content-max) space-y-3 px-(--page-x) py-4"}>
      <header className="flex items-center justify-between px-2 pb-3">
        <a href={`/${location.search}`} aria-label="Korzina — главная" className="flex items-center gap-2 text-title-3">
          <img src="/brand/korzina.svg" alt="" className="size-9" />
          Korzina
        </a>
        <span className="text-caption text-muted-foreground">Основа дизайна</span>
      </header>
      <KitSection title="Цвет вашего магазина">
        <ThemePicker initial={theme} onChange={setTheme} />
      </KitSection>
      <KitSection title="Акценты">
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(resolveTheme(theme)).map(([key, value]) => (
            <ColorSwatch key={key} value={value} label={key.slice(2)} />
          ))}
        </div>
        <div className="space-y-3 border-t border-border pt-4">
          <div className="rounded-pill bg-primary px-5 py-3 text-center text-label text-primary-foreground">
            Ваша кнопка
          </div>
          <div className="rounded-md bg-primary-soft p-4 text-caption text-primary-text">
            Мягкий акцент · Цена со скидкой
          </div>
          <p className="text-label text-primary-strong">Акцентная ссылка →</p>
        </div>
      </KitSection>
      <KitSection title="Поверхности и статусы">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-pill bg-status-neutral px-3 py-2 text-caption text-status-neutral-foreground">
            Черновик
          </span>
          <span className="rounded-pill bg-status-warning px-3 py-2 text-caption text-status-warning-foreground">
            Ожидает
          </span>
          <span className="rounded-pill bg-status-danger px-3 py-2 text-caption text-status-danger-foreground">
            Новый
          </span>
          <span className="rounded-pill bg-status-success px-3 py-2 text-caption text-status-success-foreground">
            Готово
          </span>
        </div>
        <p className="text-body text-foreground-body">
          Карточки на спокойном фоне, общие радиусы и цвета статусов для всех магазинов.
        </p>
        <p className="text-caption text-muted-foreground">Вторичный текст</p>
        <p className="text-small text-subtle-foreground">Дополнительная подпись</p>
      </KitSection>
      <Typography />
      <footer className="px-2 py-4 text-small text-muted-foreground">Korzina · Токены и оформление · F6</footer>
    </div>
  );
}
