# Korzina · Корзина

Независимый магазин с витриной, кабинетом продавца, Telegram Mini App и ботом. Разработку ведём в Codex из этого приватного репозитория. Figma хранит макеты, MagicPath помогает быстро собрать и проверить интерфейс, GitHub хранит принятый код и контекст проекта.

## Продолжить в новом чате

Откройте репозиторий в Codex и начните новый чат: Codex прочитает `AGENTS.md`. Напишите «Продолжай» — агент возьмёт текущую задачу из `docs/PROGRESS.md`.

- [AGENTS.md](AGENTS.md) — правила работы агента.
- [План](docs/PLAN.md) — фазы F → B → S → O → L → A и карточки задач.
- [Архитектура](docs/ARCHITECTURE.md) · [Правила кода](docs/CONVENTIONS.md) · [Дизайн и MagicPath](docs/DESIGN.md)
- [Бизнес-правила](docs/DOMAIN.md) · [Блоки Figma](docs/SCREENS.md) · [Решения](docs/DECISIONS.md) · [Прогресс](docs/PROGRESS.md)

## Запуск

Node.js — версия из `.node-version`. После установки зависимостей:

```sh
npm ci
npm run dev
npm run check
```

`dev` применяет локальные миграции D1 и сид двух магазинов. В браузере пока отображается каркас Korzina; продуктовые экраны идут после фазы F.

### Сессии и вход (F4)

- Покупатель: `POST /api/auth/guest?shop=test2`, затем `GET /api/auth/session?shop=test2`; logout — `POST /api/auth/logout`. Cookie разделены по магазину, `HttpOnly`, `SameSite=Lax`, `Secure` вне localhost. Telegram-вход: `POST /api/auth/telegram`, JSON `{initData, bearer?: true}`; bearer нужен для Mini App.
- Продавец: `/api/platform/auth/email/start` с `{email}`, затем `/email/verify` с `{challengeId, code}`; `/api/platform/auth/telegram` — вход через бот платформы; `/session` и `/logout` — проверка и выход. Все POST требуют JSON и `Idempotency-Key`, запрос с чужого Origin отклоняется. Вход не выдаёт роль: она берётся из `memberships` выбранного магазина.
- Email-доставка в F4 — **только локальная заглушка**: `email/start` возвращает `devCode` на localhost. На demo код не возвращается и отправка пока недоступна (`AUTH_UNAVAILABLE`). Одноразовый код живёт 10 минут, допускает 5 попыток; повторное погашение — `UNAUTHORIZED`. В базе только хеши кодов и токенов. Auth-ответы с новыми credentials не сохраняются в таблицу идемпотентных бизнес-команд; одноразовый вход повторно не воспроизводится.
- Необязательные секреты: `PLATFORM_BOT_TOKEN` — собственный бот Korzina; `ENCRYPTION_KEY` — 32 байта в hex для AES-GCM; токен бота магазина хранится в его `settings.telegram_bot_token` как `v1.<iv hex>.<cipher base64>` с привязкой ciphertext к shop ID. Устанавливать только через Cloudflare secrets или локальную `.dev.vars`; значения в Git не добавлять. Без секретов Telegram-вход закрыт. Управление ботом из кабинета относится к S7.
- Проверка доступа: `GET /api/seller/access?shop=test2`, подпути `/orders`, `/payments`, `/team`. Требуется сессия продавца и действующая запись `memberships`; права каждый раз читаются с primary D1. Управление приглашениями/сотрудниками и экран кабинета относятся к S1/S8.


### Флаги функций (F5)

Реестр — `src/shared/flags.ts`: core работает без флага; `addon` выключен по умолчанию;
`rollout` использует свой `default`. Явный `off` перекрывает включённый default.
`GET /api/shop?shop=lavka` возвращает `features` вместе с магазином, с `no-store`.
Серверный `requireFeature` читает primary D1 на каждом обращении к защищённому маршруту;
выключение действует на следующий запрос и не удаляет данные. Проверка роли нужна отдельно.

```sh
npm run flag -- lavka cashback on --local
npm run flag -- lavka cashback off --local
```

Без `--local` команда изменяет только собственную demo D1 через авторизованный `cf`.
Неизвестные магазин, ключ или состояние — ошибка; повторное значение не пишет строку заново.
Публичного API управления флагами нет; админка появится в AD2.
Клиент: `FeatureProvider` получает текущий ответ `/api/shop`, `useFeature('cashback')`
возвращает `false` до загрузки и после выключения; провайдер подключается оболочкой F8.
На demo/localhost доступен проверочный `GET /api/diagnostics/features/cashback`:
`403 FEATURE_DISABLED` при off, `200` при on. Это проверка доступности;
сам кешбэк и кошелёк относятся к A4 и ещё не реализованы. Реальных rollout-флагов пока нет.

## Фото и файлы (F9)

Проверочный экран — `/dev/media?shop=test2` (покупатель) и `&as=seller` (нужна сессия сотрудника).
Выбор в PhotoPicker сразу запускает загрузку, поддерживаются несколько файлов, прогресс, повтор и порядок. Перед отправкой фото сжимаются до 2048 px/WebP 85%; HEIC-декодер загружается отдельно.
Для локальных подписанных ссылок задайте случайный `MEDIA_SIGNING_KEY` в игнорируемом `.dev.vars`.

- `POST /api/media/upload?purpose=receipt` — бинарное тело, `Idempotency-Key`; назначения и права проверяет сервер.
- `POST /api/media/:id/state` — JSON `{action:"attach"|"delete"}` и `Idempotency-Key`.
- `GET /api/media/:id/link` — ссылка на 5 минут; при открытии всё равно требуются сессия и актуальные права.
- `GET /api/media/usage?as=seller` — занято/лимит. По умолчанию 2 ГБ; настройка D1 `platform_settings.media_limit_bytes` — для админки AD3.

R2 demo: `korzina-demo-media` — приватный; `korzina-demo-media-public` — только перекодированные фото с доменом `media.demo.korzina.app`.
Размеры 160/400/800/1600 создаются один раз через Images; публичные файлы идут из R2/CDN без Worker и БД.
На localhost публичный R2 заменяет отдельный адаптер `/api/media-public/*`; на demo/prod он всегда возвращает 404.
Уборка temp после 24 часов и удалённых после 30 дней — alarm, только при наличии работы, порциями по 50.
Prod не создавался: при его запуске нужны отдельные `korzina-prod-media`/`korzina-prod-media-public`, домен и новый секрет.

## Каталог (B1)

- `GET /api/catalog/document?shop=lavka` — категории, бренды и компактные плитки (по 50), без цен/остатков и полных описаний. Фильтры: `category`, `brand`; продолжение: `after=<next>`.
- Повтор: `version=<catalogVersion>` с теми же фильтрами и `If-None-Match` из ответа. Ключ Cache API разделён по окружению, магазину, версии и странице; совпавший документ обходится без DO. Ответ поддерживает `304`. Начальная ссылка без версии кешируется на 30 секунд.
- `GET /api/catalog/live?shop=lavka&ids=sku-01,sku-02` — актуальные цены в минимальных единицах, остаток, `visible`/`available`, валюта и `hideOutOfStock`. До 50 SKU; `stock:null` означает отсутствие учёта, удалённый SKU возвращается с `visible:false` и `priceMinor:null`. Всегда `no-store`.
- Клиент показывает только `visible` из live; при расхождении `catalogVersion` запрашивает новый документ с версией из live. Цена/остаток не увеличивают публичную версию; смена названий, фасовок, публикации, категорий, брендов и порядка фото увеличивает её в той же SQL-транзакции.
- `GET /api/catalog/products/product-01?shop=lavka` — полное описание, упорядоченные фото, видимые фасовки и текущие цены/остатки. Всегда `no-store`; скрытый, неопубликованный или удалённый товар — `404`.

Сид автоматически применяется один раз только к двум собственным demo-магазинам (`lavka`, `test2`), вне production: 14 товаров / 24 SKU из данных Lavka. Изменения при перезапуске сохраняются. Фото и информационные кадры скопированы в собственные Static Assets с версией в имени; R2 и платные преобразования не вызываются. Описания полей для будущего импорта — `npm run schema:shop`. Проверка API: `npm run smoke:catalog -- <baseURL>`; workflow **Demo smoke** выполняет её на demo после изменений main, затрагивающих каталог.

## Публикация demo

Текущее окружение Korzina предназначено только для `https://demo.korzina.app`, Worker `korzina-demo`. Конфигурация — `cloudflare.config.ts`; автоматическая публикация настроена для ветки `main` репозитория `vir2ozz2009/korzina`. У этого окружения нет связей с сервисами, базами и ботами Lavka.

Проверка перед публикацией:

```sh
npm ci
npm run build
npx cf deploy --prebuilt --dry-run
```

Сборка находится в `.cloudflare/output/v1/`, а не в `dist/`. Для ручной публикации после входа в Cloudflare используйте `npm run deploy`.

Workers Builds подключён к `vir2ozz2009/korzina`, ветке `main`. Настройки: корень `/`, build command `npm run build`, deploy command `npx cf deploy --prebuilt`, `NODE_VERSION=24.22.1`. После публикации запускается `npm run smoke:demo` — health, HTML, bootstrap и JS. Используется отдельный токен `Workers Builds — korzina-demo`; тесты здесь не повторяются. Настройки доступны в Cloudflare → Workers & Pages → `korzina-demo` → Settings → Builds.

### Проверки и превью (F10)

- `npm run check:fast` — типы, Biome и архитектура; `npm run test:related` — тесты по изменениям относительно `origin/main`; `npm run check` — полный контроль, включая Knip и размер сборки.
- `npm run test:e2e` — один smoke на 390 px; перед первым запуском `npx playwright install chromium`. Уже установленный Chromium можно выбрать через `PLAYWRIGHT_EXECUTABLE_PATH`; удалённый адрес — через `E2E_BASE_URL`.
- `npm run build` создаёт demo-сборку со служебными экранами. `npm run build:prod` исключает их из клиентского JS и закрывает `/dev/*`, демо-карточки и diagnostics на сервере. Это проверка будущей prod-сборки; настоящие ресурсы prod ещё не созданы.
- В PR из `task/*` GitHub Actions показывает `Check`. Smoke запускается по метке `e2e` и ежедневно в 06:00 МСК. Подробности — `docs/TESTING.md`.
- Для веток Workers Builds запускает `npm run preview:upload`: `platform:setup --preview --seed` применяет миграции и сид только в D1 превью; затем `cf previews deploy --mode demo` сам собирает и публикует Worker Preview, затем короткая HTTP-проверка проверяет API, UI-кит, bootstrap `test2` и JS. Стабильная ссылка появляется в PR; трафик demo не переключается. Превью публичное на `workers.dev`: **Shop DO изолированы по веткам через `ctx.exports`**, D1/R2 — отдельные `korzina-preview-*`. Удалённые demo D1/R2 изменяет только `main`; CLI отклоняет миграции demo из ветки. Публичная выдача R2 превью пока выключена. Приватные подписанные ссылки требуют отдельного `MEDIA_SIGNING_KEY` превью; ключ demo не копируется. Настоящие ресурсы prod ещё не созданы. Основной `workers.dev` адрес выключен.
- Для среды с ограничением записи в домашнюю папку задайте `XDG_CONFIG_HOME` в доступный каталог; это место локального реестра Miniflare.

Изменения следует отправлять в `main` только после проверки: успешная сборка этой ветки обновит demo. Другие домены не входят в конфигурацию. Для отката выберите предыдущую версию в Cloudflare → `korzina-demo` → Deployments; откат кода не откатывает данные будущей базы.
