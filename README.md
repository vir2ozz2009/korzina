# Korzina · Корзина

Независимый магазин с витриной, кабинетом продавца, Telegram Mini App и ботом. Разработку ведём в Codex из этого приватного репозитория. Figma хранит макеты, MagicPath помогает быстро собрать и проверить интерфейс, GitHub хранит принятый код и контекст проекта.

## Продолжить в новом чате

Откройте репозиторий в Codex и начните новый чат: Codex прочитает `AGENTS.md`. Напишите «Продолжай» — агент возьмёт текущую задачу из `docs/PROGRESS.md`.

- [AGENTS.md](AGENTS.md) — правила работы агента.
- [План](docs/PLAN.md) — фазы F → B → S → O → L → A и карточки задач.
- [Архитектура](docs/ARCHITECTURE.md) · [Правила кода](docs/CONVENTIONS.md) · [Дизайн и MagicPath](docs/DESIGN.md)
- [Бизнес-правила](docs/DOMAIN.md) · [Блоки Figma](docs/SCREENS.md) · [Решения](docs/DECISIONS.md) · [Прогресс](docs/PROGRESS.md)

## Запуск

Кода приложения пока нет: разработка начинается с нуля с задачи F1 (`docs/PLAN.md`). После F1 здесь появятся команды `npm run dev` и `npm run check`. Node.js — версия из `.node-version`.

В репозитории сохранены только инфраструктурные файлы: `cloudflare.config.ts` (Worker `korzina-demo`, домен demo), `.node-version`, `.codex/environments/` и знак `public/brand/korzina.svg`.

## Публикация demo

Текущее окружение Korzina предназначено только для `https://demo.korzina.app`, Worker `korzina-demo`. Конфигурация — `cloudflare.config.ts`; автоматическая публикация настроена для ветки `main` репозитория `vir2ozz2009/korzina`. У этого окружения нет связей с сервисами, базами и ботами Lavka.

Проверка перед публикацией:

```sh
npm ci
npm run build
npx cf deploy --prebuilt --dry-run
```

Сборка находится в `.cloudflare/output/v0/`, а не в `dist/`. Для ручной публикации после входа в Cloudflare используйте `npm run deploy`.

Workers Builds уже подключён к `vir2ozz2009/korzina`, ветке `main`. Настройки: корень `/`, build command `npm run build`, deploy command `npx cf deploy --prebuilt`, переменная сборки `NODE_VERSION=24.22.1`. Используется отдельный токен `Workers Builds — korzina-demo`; previews других веток отключены. Настройки доступны в Cloudflare → Workers & Pages → `korzina-demo` → Settings → Builds. Первая публикация прошла; подтверждения и ограничения проверки сайта были записаны в прежнем прогрессе (история Git, коммит `6a11833`). `--force` был разрешён владельцем только для первой замены API-заглушки и удалён из команды после публикации.

Изменения следует отправлять в `main` только после проверки: успешная сборка этой ветки обновит demo. Другие домены не входят в конфигурацию. Для отката выберите предыдущую версию в Cloudflare → `korzina-demo` → Deployments; откат кода не откатывает данные будущей базы.
