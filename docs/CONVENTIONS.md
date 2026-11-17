# Правила кода

## Экраны (маршруты)

Файл маршрута тонкий: до ~60 строк, без бизнес-логики и своей вёрстки состояний. Маршрут, шаблон и переход экрана берутся из `docs/design-system/navigation.md`.

```tsx
export const Route = createFileRoute('/(shop)/product/$slug')({
  staticData: { transition: 'push', title: 'Товар' },
  loader: ({ context, params }) => context.qc.ensureQueryData(productQuery(params.slug)),
  component: ProductScreen,
})

function ProductScreen() {
  const { slug } = Route.useParams()
  const q = useProduct(slug)               // features/catalog/api.ts
  return (
    <Screen header={<Header back share fav />} footer={<BuyBar sku={...} />}>
      <QueryBoundary query={q}>{(p) => <ProductView product={p} />}</QueryBoundary>
    </Screen>
  )
}
```

- `Screen`, `Header`, `QueryBoundary` и `Sheet` уже умеют безопасные зоны, прокрутку, скелетоны, «пусто», «ошибка + повтор» и кнопку «Назад» в Telegram.
- Тип перехода задаётся только в `staticData.transition`: `push` | `sheet` | `tab` | `fade` | `none`. Компонент страницы анимацию не пишет.
- Модальные шаги — это маршруты-шторки (`transition: 'sheet'`) или `<Sheet>`. На шторку можно сослаться по ссылке и закрыть кнопкой «Назад».

## Данные на клиенте

- Все запросы — в `features/<x>/api.ts`: `xxxQuery()` (queryOptions) + `useXxx()` + мутации. Компоненты не вызывают `fetch` и `client` напрямую.
- Клиент API: `export const api = hc<AppType>('/api')`. Типы ответа берутся из сервера, вручную не дублируются.
- Ключи Query — фабрики в `api.ts` (`catalogKeys.product(slug)`).
- Мутации корзины оптимистичные, с откатом при ошибке. Мутации денег и заказа не оптимистичные, показывают ожидание.
- Глобальное клиентское состояние — только UI (открыта ли шторка, тема). Корзина, избранное и профиль лежат на сервере, в localStorage — только гостевой кеш.

## Сервер

- Модуль: `server/modules/<x>/routes.ts` (Hono, zod-валидация) + `service.ts` (логика) + `<x>.test.ts`.
- Изменяющая команда: принимает `Idempotency-Key`, проверяет права и `expectedVersion`, выполняется в одной транзакции DO, пишет `order_events`/`outbox` в той же транзакции. Внешние вызовы (Telegram, оплата) — только из outbox через очередь.
- Ошибки: один формат `{ error: { code, message, details? } }`. Коды в `src/shared/errors.ts` (`STOCK_CHANGED`, `PRICE_CHANGED`, `VERSION_CONFLICT`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`...). Клиент показывает их через общий `ErrorView` или тост.
- Деньги: целые числа в минимальных единицах (`price_minor`) + `currency`. Арифметика только через `src/shared/money.ts`. Никакого `float` и `* 100` в коде фич.
- Время: хранить UTC; день, слот и часовой пояс магазина — отдельными полями.

## Стиль

- TypeScript strict, без `any`. Именованные экспорты. Компонент — PascalCase-файл, хук — `useX.ts`.
- Цвета, радиусы, тени и шрифты — только токены (`bg-primary`, `rounded-card`). Жёсткие hex и px в фичах запрещены; исключение — значение в `src/ui` с комментарием.
- Тексты интерфейса — на русском, в компоненте рядом (i18n не делаем до решения Андрея).
- Не оставляй мёртвый код, закомментированные блоки и TODO без ID задачи.

## Тесты

- `model.ts` и `service.ts` — юнит-тесты Vitest на каждое правило из карточки задачи.
- API — тесты с настоящим DO и D1 (`@cloudflare/vitest-pool-workers`), включая изоляцию двух магазинов, когда это затрагивает задача.
- UI — не тестируем снимками. Сквозные Playwright-сценарии добавляются только в задачах с пометкой `e2e`.
- `npm run check` = типы, Biome, `check:arch`, `vitest run` — не дольше 90 с. Уровни проверки, что тестировать и чего не тестировать — `docs/TESTING.md`.

## Описание магазина (shop-spec)

Каждая задача, которая добавляет данные магазина (каталог B1, доставка и расписание S4, оплата S5, данные и оформление S6 и т. д.), в том же коммите добавляет их раздел в `src/shared/contracts/shop-spec.ts`: поля, стабильный `key` для записей списков, описание поля на русском (оно попадёт в инструкцию для нейросети). Сам импорт и экспорт — задача AD4; до неё схема только пополняется.

## Автоматическая проверка архитектуры (`npm run check:arch`)

Скрипт `scripts/check-arch.ts` (создаётся в F1, дополняется по мере появления папок) падает, если:
- в `src/features/**`, `src/routes/**` или `src/ui/**` есть hex/rgb-цвет (цвета — только в `tokens.css` и `theme-presets.ts`), а также `text-white` на `bg-primary` (нужен `text-primary-foreground`), `px` в произвольных классах Tailwind (`w-[123px]`) или inline `style` с цветом;
- фича импортирует внутренности другой фичи (`features/a/...` → `features/b/ui/...`); общее — только через `src/ui`, `src/shared`, `features/<x>/index.ts`;
- клиентский код импортирует `server/**` (кроме единственного стираемого `import type { AppType }` в `src/shared/api.ts` для Hono RPC), а сервер — `src/features/**`;
- файл длиннее 250 строк (исключения — список в скрипте с причиной);
- в маршруте есть `fetch(` или прямой вызов `api.`;
- в коде фич есть арифметика денег вне `money.ts` (`* 100`, `/ 100`, `toFixed`).

Исключение добавляется только в список скрипта с ID задачи и причиной.

## Git

- Ветка `task/<ID>-<кратко>`, коммиты `<ID>: что сделано`. Один PR — одна задача из PLAN.md.
- В `main` вливаем только зелёный `check`. После вливания проверяем demo.
