# Подключение бота `korzina-demo-lavka`

24.11.2026 · В окне вокруг 07:35 МСК в журнале Worker `korzina-demo` не найдено попытки подключения. В D1 привязки для `korzina-demo-lavka` нет. У воркера задан секрет `ENCRYPTION_KEY`. Причина исходного сбоя неизвестна.

Workers Logs сохраняет событие `shop_bot_connect_failed` при выборке журналов 100% и трассировок 1%. Фильтры в Observability: `event = shop_bot_connect_failed` и `shopId = korzina-demo-lavka`. В событии есть этап, код ошибки и данные об ошибке Telegram, включая HTTP-статус при наличии. Возможные этапы: `getMe`, `prepare_encryption_key`, `setWebhook`, `setChatMenuButton`, `save_binding`.

`server/platform/admin/shop-bot.test.ts` проверяет все пять этапов на имитациях Telegram и D1. Сетевой сбой и таймаут различаются. Если Telegram не подтверждает установку меню, новая привязка не сохраняется, а зарегистрированный webhook удаляется.

После успешного Demo smoke нужна одна попытка из карточки «Демо-магазин». Успех проверяется в `shop_bots` и по событию `bot.connected` в `platform_audit`.
