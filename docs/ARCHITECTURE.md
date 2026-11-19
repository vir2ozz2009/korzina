# Архитектура Korzina

## 1. Принципы

- **Одна платформа — много магазинов.** Один деплой обслуживает все магазины. Новая функция после выпуска сразу доступна всем, и магазины не нужно обновлять по отдельности.
- **Изоляция магазина заложена в устройство системы.** Данные каждого магазина лежат в его собственной базе SQLite внутри Durable Object `Shop`. Ошибиться и показать чужие данные невозможно: запрос физически приходит в объект своего магазина.
- **Лёгкий стек без серверного рендеринга и отдельного бэкенд-сервиса.** Один Cloudflare Worker отдаёт статику SPA и API.
- **Сквозные типы.** Схема zod → маршрут Hono → клиент `hc<AppType>`. Изменили контракт на сервере — фронтенд перестанет компилироваться.

## 2. Стек

| Слой | Выбор | Почему |
|---|---|---|
| Язык | TypeScript strict | Один язык на клиенте и сервере |
| Сборка | Vite + `@cloudflare/vite-plugin` | Мгновенный HMR, локальные D1, DO и R2 в `npm run dev` |
| UI | React 19 + Tailwind CSS v4 | Тот же стек, что в шаблоне MagicPath: код с холста переносится без перевода |
| Примитивы | shadcn/ui (Radix), `vaul` для шторок, `lucide-react` для иконок | Доступность и поведение из коробки, токены совпадают с темой MagicPath |
| Анимация | `motion` | Единые переходы экранов и жесты |
| Роутинг | TanStack Router (файловые маршруты, типизированные параметры) | Типобезопасные ссылки, загрузчики, `staticData` маршрута для типа перехода |
| Данные | TanStack Query | Кеш, повтор, отмена, оптимистичные изменения корзины |
| Формы | react-hook-form + zod | Одни и те же схемы на клиенте и сервере |
| API | Hono + `@hono/zod-validator` + Hono RPC | Минимальный, быстрый, родной для Workers |
| Данные магазина | Durable Object `Shop` со встроенным SQLite + Drizzle ORM (`drizzle-orm/durable-sqlite`) | Транзакции ACID для заказов, остатков и денег; один экземпляр на магазин; масштабируется без настройки |
| Данные платформы | D1 `platform` + Drizzle | Реестр магазинов, домены, аккаунты продавцов, флаги |
| Файлы | R2 + Cloudflare Images (`/cdn-cgi/image/`) | Фото и вложения: сжатие на клиенте, очистка EXIF, ресайз на лету, публичные и приватные файлы, уборка, лимит на магазин (PLAN F9) |
| Фоновые задачи | Алармы DO (ставятся только при наличии работы) + Cloudflare Queues для тяжёлых пакетов | Уведомления Telegram, истечение резервов, расписания; простаивающий магазин не тратит ресурсы |
| Telegram | `grammY` (webhook), тонкий адаптер `window.Telegram.WebApp` | Бот магазина и Mini App |
| Качество | Biome (линтер и форматтер), Vitest, `@cloudflare/vitest-pool-workers`, Playwright (только сквозные smoke-тесты) | Быстро и одной командой |
| Пакеты | npm (как в Workers Builds) | Деплой уже настроен |

Версии — актуальные стабильные на момент создания каркаса, закреплены в lock-файле. Не добавляй зависимость, если задачу решают 30 строк своего кода.

## 3. Структура репозитория

```
src/
  app/                 # каркас фронтенда: роутер, AppShell, шаблоны экранов, переходы, провайдеры
    shell/             # Screen, Header, TabBar, Sheet-host, Transition, QueryBoundary
    telegram/          # адаптер Mini App: viewport, BackButton, тема, initData
  routes/              # тонкие файлы маршрутов TanStack: только загрузчик и композиция
    (shop)/...         # витрина покупателя
    seller/...         # кабинет продавца
  features/<feature>/  # вертикальный срез: ui/, api.ts (хуки Query), model.ts (чистая логика)
  ui/                  # UI-кит: Button, Price, Stepper, ProductTile, Sheet... (одинаков в приложении и MagicPath)
  styles/tokens.css    # единственный источник токенов (@theme Tailwind v4)
  shared/              # zod-контракты, типы, деньги, форматирование: общие для клиента и сервера
    contracts/<feature>.ts
    money.ts, flags.ts, errors.ts
server/
  index.ts             # Hono: определение магазина по host, auth, маршрутизация в Shop DO
  platform/            # D1: магазины, домены, аккаунты, флаги
  shop/                # Durable Object Shop: schema.ts, migrations/, commands/, queries/
  modules/<feature>/   # роуты и сервисы фичи (catalog, cart, checkout, orders, payments...)
  telegram/            # бот, webhook, отправка уведомлений
  jobs/                # обработчики очереди
tests/e2e/             # 5–10 сквозных сценариев Playwright
docs/
```

**Правило среза.** Фича живёт в `src/features/<x>` + `server/modules/<x>` + `src/shared/contracts/<x>.ts`. Удаление фичи = удаление этих папок и одной строки регистрации.

## 4. Как обрабатывается запрос

```
Браузер / Telegram ─► Worker (Hono)
   ├─ /assets, /*        → статика SPA (+ HTMLRewriter: title, og-теги, начальные данные магазина)
   ├─ /api/platform/*    → D1 platform (регистрация, вход продавца, админ)
   ├─ /api/*             → resolveShop(host) → auth → env.SHOP.get(idFromName(shopId)).fetch()
   └─ /tg/:shopId        → webhook бота магазина (проверка secret_token)
```

- `resolveShop`: `host` → `platform_domains` → `shopId`, кеш в памяти изолята и Cache API (60 с). Для локальной разработки: `?shop=slug` или `localhost` → демо-магазин.
- Внутри DO запросы обрабатывает тот же Hono-роутер модулей магазина. Команды, меняющие состояние, выполняются в `ctx.storage.transactionSync`.
- Публичная часть каталога кешируется Worker (Cache API, ключ `shopId + catalogVersion`, `ETag`); оперативные цены и остатки — отдельным некешируемым ответом. Изменение товаров меняет `catalogVersion` (PERFORMANCE §2).

## 5. Модель данных (верхний уровень)

**Platform D1:** `shops(id, slug, name, status, plan, created_at)`, `domains(host, shop_id)`, `accounts(id, telegram_id, email)`, `memberships(shop_id, account_id, role, permissions)`, `feature_overrides(shop_id, key, enabled)`, `audit`.

**Shop DO (SQLite):** `media` (назначение, статус `temp`/`attached`, размер — для лимита и уборки), `settings`, `categories`, `brands`, `products`, `variants(sku, price_minor, stock, visible)`, `customers`, `sessions`, `carts`, `cart_lines`, `orders`, `order_lines`, `order_events`, `payments`, `refunds`, `delivery_zones`, `slots`, `reservations`, `idempotency`, `outbox`. Подробно правила — `docs/DOMAIN.md`. Таблицы добавляются задачами по мере надобности, а не все сразу.

**Данные магазина.** Схему и миграции ведём в Drizzle. Запросы в Shop DO по умолчанию пишем через Drizzle. Сырой `storage.sql.exec` допустим в горячих путях и внутри `transactionSync`, если имена таблиц и колонок сверены со схемой, а бюджет SQL закреплён тестом.

Миграции Drizzle собираются в бандл. DO применяет их при первом запросе после деплоя (`blockConcurrencyWhile`), поэтому выпуск сам «раскатывается» на все магазины.

## 6. Функции и флаги

- `src/shared/flags.ts` — единый реестр: `{ key, kind: 'addon' | 'rollout', default, description }`. Порядок выпуска — `docs/NEW_FEATURE.md`.
- Без флага — базовая функция работает у всех сразу после выпуска.
- `rollout` — базовая функция, которую выкатываем постепенно (пилотные магазины → все); после раскатки флаг удаляется.
- `addon` — функция подключается магазину по запросу: выключена по умолчанию, включается записью в `feature_overrides` (админка или скрипт `npm run flag -- <shop> <key> on`).
- Сервер: `requireFeature('cashback')` в роуте. Клиент: `useFeature('cashback')` прячет вход в функцию. Флаги приходят вместе с `GET /api/shop` (начальные данные).
- Любой флаг — аварийный выключатель: выключение прячет функцию без удаления данных и без отката релиза.
- Флаг управляет только доступностью. Права и деньги всё равно проверяются сервером.
- Продуктовые настройки магазина (способы оплаты, режим доставки, пресет оформления витрины) — это не флаги, а `settings` магазина.

## 7. Безопасность и вход

- Покупатель в Mini App: сервер проверяет подпись `initData` (HMAC токеном бота магазина) и `auth_date ≤ 24 ч`, затем выдаёт cookie сессии (HttpOnly, SameSite=Lax; в Mini App — заголовок `Authorization`).
- Покупатель на сайте: гостевая cookie-сессия. Вход через Telegram — deep link в бота магазина с одноразовым кодом, затем возврат к действию.
- Продавец: вход через Telegram (бот платформы) или код на email → аккаунт платформы → `memberships`. Каждая команда кабинета проверяет роль и разрешение.
- Изменяющие запросы: same-origin, заголовок `Idempotency-Key`. Лимиты запросов — по IP и сессии.
- Токены ботов шифруются (AES-GCM, ключ в secret `ENCRYPTION_KEY`), клиенту не возвращаются.
- Боты (решение D13): **бот платформы** — токен в secret `PLATFORM_BOT_TOKEN`, вход продавцов и уведомления продавцам; **бот магазина** — токен хранит магазин (зашифрован), вход покупателей, Mini App, уведомления покупателям. На demo — отдельные тестовые боты, рабочие боты подключаются только на prod.

## 8. Окружения

| Окружение | Адрес | Данные |
|---|---|---|
| local | `localhost:5173` | локальные D1, DO и R2 (Miniflare), сид двух магазинов: `lavka`, `test2` |
| demo — тестовый стенд приёмки Андрея (stage), не для продавцов | `demo.korzina.app` (+ `*.demo.korzina.app` после покупки wildcard) | отдельные ресурсы `korzina-demo` |
| prod | `korzina.app` — лендинг; `*.korzina.app` — магазины (зарезервированные имена — DECISIONS D14/D15) | отдельно, только по решению Андрея; Lavka выключается при запуске |

Превью ветки: Worker Previews (отдельные Shop DO через `ctx.exports`, D1/R2 `korzina-preview-*`; demo изменяет только `main`). Version URLs для Worker с Durable Objects не выдаются. Привязки (D1, R2, DO, Queue) описываются в `cloudflare.config.ts`; если CLI `cf` ещё не поддерживает нужную привязку, переходим на `wrangler.jsonc` и правим README.

## 9. Бюджеты производительности (проверяются в фазе L)

Бюджеты запросов к базе по сценариям и правила экономии — `docs/PERFORMANCE.md`.

- JS витрины на первом экране: цель ≤ 135 КБ gzip, потолок 160 КБ (PERFORMANCE.md §7); кабинет загружается отдельным чанком.
- API чтения каталога p95 ≤ 150 мс; команда оформления p95 ≤ 400 мс.
- LCP главной на 4G ≤ 2,0 с; изображения: AVIF/WebP, `srcset`, ленивая загрузка ниже первого экрана.
