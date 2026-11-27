# CONTEXT-CODE · первый PR seller HTTP · 27.11.2026

Основа: свежий main `9fb98d6`; подтверждены только три дубля из карточки. Полный аудит повторно не запускался. Подготовка началась около 23:18 МСК; точные длительности проверок будут взяты из их результатов.

## Владение с 12.3

Обе работы ведёт этот облачный чат. A6 сохранён в `task/A6`, `7df1ca8`, и продолжится после ограниченного PR; его код не входит в этот diff. CONTEXT-CODE использует отдельный `/workspace/korzina-context-code` от свежего main. Три адаптера ниже и новый helper принадлежат этому PR; общий `seller/api.ts`, promo API, примеры/корзина, серверные деньги/доставка — A6. Список активных чатов и фактический diff A6 сверены; пересечений исходников нет.

## Изменение и все потребители

Общее `fetch` → сессия продавца на запрос → `checkResponse` → Response перенесено в `src/features/seller/http.ts:sellerHttp`.

| Адаптер, исходный символ | Сохранённая ответственность / потребители |
|---|---|
| `orders-api.ts:request` | URL/store, исключение undefined и пустой строки, no-store. `useSellerOrderList` (первая/следующая страница), `useSellerOrderBadge`, `useSellerOrder`, `useSellerOrderCommand`, `sellerReceiptFile`, `sellerOrdersSocket` (ticket), `useSellerWorkday`, `useSellerPacking`, `useSellerCalendar`. JSON/blob, signal, команды и инвалидации остались в адаптере. |
| `money-api.ts:read` | Falsy-фильтры, JSON, TypeError → ConnectionError только без abort. `useMoneyOverview`, `useMoneyOperations`, `useMoneyTasks`; ключи/повторы/refresh прежние. |
| `sales-api.ts:read` | Исключается только undefined, Zod после JSON. `useSalesSummary`, `useSalesReport`, `useSalesDays`, `useSalesRank`, `useProductSales`; кодирование id и параметры прежние. |

Прямые UI-потребители: SellerTabs, useSellerOrdersLive, MoneyScreen/MoneyLists, SellerOrderScreen/SellerOrdersList/ReceiptDocument, WorkdayScreens/WorkdaySummary, ProductReport/SalesOverview/SalesProducts/StatsCard. Они получают те же hooks/операции; их код не менялся. `SalesScreen` использует только тип SalesSession.

Общих cache/retry/ключей/store-состояния не добавлено. Снижение D1/CPU/времени и точная экономия контекста не измерялись и не заявляются. Карта 12.3 не менялась: новой зависимости от транспорта у неё нет; короткий маршрут этой задачи — карточка и точные пути выше.

## Проверки

Одни адресные тесты прошли до изменения трёх адаптеров (11/11, 1,36 с) и после него. `test:related`: 21/21 в 5 файлах, 5,85 с; проверены два магазина/две сессии, различия фильтров/cache, signal/abort/TypeError, HTTP, Zod, blob и JSON/ключ команды. Существующие тесты денег/прав/заказа не изменены. check:fast проходит перед Ready; полный Check — в CI.

Прочитано: AGENTS/PROGRESS свежего main, CONTEXT-CODE, маршрут контекста/поддержание и передача WORKFLOW, TESTING §1/проверки; адресно три адаптера, их импорты/вызовы и существующий тест заказа. Расширение — helper сессии/checkResponse и HTTP-тесты для сохранения границ. Повторного архитектурного аудита нет.

Обновление Work 27.11.2026: [PR #340](https://github.com/vir2ozz2009/korzina/pull/340) влит в main `89d4da6cfd1272cb3f176f83ee86e018950d6d3d`; [Check](https://github.com/vir2ozz2009/korzina/actions/runs/46041518072) на head `4832aab` завершён успешно. Первый ограниченный рефакторинг выполнен. Другие дубли, результат A6 и продуктовая приёмка этим не закрываются; нового прогона Work не проводил.
