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

## Публикация demo

Текущее окружение Korzina предназначено только для `https://demo.korzina.app`, Worker `korzina-demo`. Конфигурация — `cloudflare.config.ts`; автоматическая публикация настроена для ветки `main` репозитория `vir2ozz2009/korzina`. У этого окружения нет связей с сервисами, базами и ботами Lavka.

Проверка перед публикацией:

```sh
npm ci
npm run build
npx cf deploy --prebuilt --dry-run
```

Сборка находится в `.cloudflare/output/v1/`, а не в `dist/`. Для ручной публикации после входа в Cloudflare используйте `npm run deploy`.

Workers Builds уже подключён к `vir2ozz2009/korzina`, ветке `main`. Настройки: корень `/`, build command `npm run build`, deploy command `npx cf deploy --prebuilt`, переменная сборки `NODE_VERSION=24.22.1`. Используется отдельный токен `Workers Builds — korzina-demo`; previews других веток отключены. Настройки доступны в Cloudflare → Workers & Pages → `korzina-demo` → Settings → Builds. Первая публикация прошла; подтверждения и ограничения проверки сайта были записаны в прежнем прогрессе (история Git, коммит `6a11833`). `--force` был разрешён владельцем только для первой замены API-заглушки и удалён из команды после публикации.

Изменения следует отправлять в `main` только после проверки: успешная сборка этой ветки обновит demo. Другие домены не входят в конфигурацию. Для отката выберите предыдущую версию в Cloudflare → `korzina-demo` → Deployments; откат кода не откатывает данные будущей базы.
