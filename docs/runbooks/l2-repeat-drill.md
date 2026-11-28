# Учебный L2: повторный drill в разрешённой среде

Это инструкция **следующему облачному исполнителю**, не свидетельство облачного PASS. Нужен доступ к `api.cloudflare.com` и `korzina-l2-drill-b.vir2ozz2009.workers.dev` по разрешённой политике. Не обходить действующий запрет. До выполнения — свежий main/PR SHA, зелёные проверки, отсутствие параллельного drill. Не использовать prod/Lavka, не включать тариф, не удалять D1. Данные, результаты, secret и полный журнал не помещать в Git.

Аккаунт `2dfac424ca4eaffa25ca82089bf82132`; Worker только `korzina-l2-drill-b`; D1 source `8e9a1210-1d84-4861-be7d-d051c81564d6` (`korzina-l2-drill-20261128-source`), restore `b6801517-bffe-4d3e-b46f-bb50c39f165a` (`korzina-l2-drill-20261128-restore`); R2 `korzina-l2-drill-b-{private,public,backups,restore}`. Shop namespace `7e42075a98324514915a44e200d9e3db`, RestoreShop `4ff1319c2627400a992c0b7f48f18090`. Исходный Worker без `-b` не использовать. Токен Cloudflare с минимальными правами на чтение аккаунта/настроек Worker, редактирование **только этого** Worker, обеих указанных D1 и четырёх R2; при отсутствии такого ограничения — не использовать токен для других ресурсов. `DRILL_TOKEN` — отдельный случайный секрет Worker, не Cloudflare API token.

## 1. Локальная проверка и чтение ресурсов

В проверенном checkout с Node 24.22 и зависимостями:

```bash
npm run check:fast
npx vitest run --project l2-drill
npx vitest run server/backup/l2-drill-worker.test.ts server/backup/backup.test.ts server/backup/l2-drill-order.test.ts server/backup/l2-repeat-preflight.test.ts scripts/l2-drill/identity.test.ts
```

Ожидание: все команды завершились 0. `l2-drill` дважды оформляет заказ и восстанавливает его, проверяет старый backup, несовпадение source/restore, alarm и отсутствие внешних fetch. Без этих результатов дальше не идти.

Далее в отдельном shell без `set -x`; `CF_API_TOKEN` вводится безопасным способом владельца. Команды ниже относятся только к одному аккаунту и фиксированным именам:

```bash
set -euo pipefail
umask 077
: "${CF_API_TOKEN:?Нужен Cloudflare API token}"
acct=2dfac424ca4eaffa25ca82089bf82132
worker=korzina-l2-drill-b
src=8e9a1210-1d84-4861-be7d-d051c81564d6
dst=b6801517-bffe-4d3e-b46f-bb50c39f165a
api="https://api.cloudflare.com/client/v4/accounts/$acct"
workdir=$(mktemp -d)
curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" "$api/workers/scripts/$worker/settings" > "$workdir/settings.json"
curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" "$api/workers/scripts/$worker/subdomain" > "$workdir/subdomain.json"
curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" "$api/workers/scripts/$worker/schedules" > "$workdir/schedules.json"
curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" "$api/d1/database/$src" > "$workdir/source.json"
curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" "$api/d1/database/$dst" > "$workdir/restore.json"
jq -e '.success and .result.name == "korzina-l2-drill-20261128-source" and .result.uuid == "8e9a1210-1d84-4861-be7d-d051c81564d6"' "$workdir/source.json" >/dev/null
jq -e '.success and .result.name == "korzina-l2-drill-20261128-restore" and .result.uuid == "b6801517-bffe-4d3e-b46f-bb50c39f165a"' "$workdir/restore.json" >/dev/null
jq -e '.success and .result.enabled == false and .result.previews_enabled == false' "$workdir/subdomain.json" >/dev/null
jq -e '.success and (.result.schedules | length == 0)' "$workdir/schedules.json" >/dev/null
jq -e '.success and ([.result.bindings[] | select(.name == "PLATFORM" and .database_id == "8e9a1210-1d84-4861-be7d-d051c81564d6")] | length == 1) and ([.result.bindings[] | select(.name == "RESTORE_PLATFORM" and .database_id == "b6801517-bffe-4d3e-b46f-bb50c39f165a")] | length == 1) and ([.result.bindings[] | select(.name == "SHOP_BINDING" and .namespace_id == "7e42075a98324514915a44e200d9e3db")] | length == 1) and ([.result.bindings[] | select(.name == "RESTORE_BINDING" and .namespace_id == "4ff1319c2627400a992c0b7f48f18090")] | length == 1)' "$workdir/settings.json" >/dev/null
for pair in 'MEDIA:private' 'MEDIA_PUBLIC:public' 'BACKUPS:backups' 'RESTORE_MEDIA:restore'; do
  binding=${pair%%:*}; suffix=${pair#*:}
  jq -e --arg binding "$binding" --arg bucket "korzina-l2-drill-b-$suffix" '[.result.bindings[] | select(.name == $binding and .bucket_name == $bucket)] | length == 1' "$workdir/settings.json" >/dev/null
  curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" "$api/r2/buckets/korzina-l2-drill-b-$suffix/objects" > "$workdir/$suffix.json"
  jq -e '.success' "$workdir/$suffix.json" >/dev/null
done
```

Проверить листинги целиком, включая пагинацию: private содержит только `l2-training-a/receipt`, public только `l2-training-a/photo`, restore только `private/l2-training-a/receipt` и `public/l2-training-a/photo`; в backup сохранены семь объектов и ETag из `repeat-worker.ts`. При первом повторе список backup должен включать семь исходных объектов. Перед каждым следующим запуском дополнительно зафиксировать полный список ключей/ETag, подтверждённых отчётами всех предыдущих запусков этого drill. Новые объекты `runs/`, `reports/`, `snapshots/`, `blobs/` и `l2-drill-final/` допустимы только если они объясняются проверенным отчётом/манифестом предыдущего запуска; неизвестные объекты, несовпадения или уже существующий маркер — СТОП, не очищать. Семь исходных ETag обязательны всегда; после каждого запуска повторно сравнить полный зафиксированный список. Убедиться, что в bindings нет бота, Telegram secret, очереди и внешнего webhook. Проверить D1 запросом ниже **для каждой** базы:

```bash
for db in "$src" "$dst"; do
  jq -n --arg sql "SELECT identity FROM l2_drill_identity; SELECT id FROM shops ORDER BY id; SELECT name,sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name;" '{sql:$sql}' |
    curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' --data-binary @- \
      "$api/d1/database/$db/query" > "$workdir/$db-query.json"
  jq -e '.success and all(.result[]; .success)' "$workdir/$db-query.json" >/dev/null
  jq '.result[].results' "$workdir/$db-query.json"
done
```

Обе базы должны содержать только таблицы `l2_drill_identity` и `shops`, shops — ровно `l2-training-a/b`; дополнительно проверить `sqlite_schema`. После прежнего восстановления метка **обеих** баз — source UUID. Это ожидаемо, но не доказывает раздельность: до записи обязательны сверка двух ID и settings выше. Бакеты также должны быть различны по фактическим bindings. Никакие другие данные или ресурсы не очищать.

## 2. Сборка и выпуск только учебного Worker

Сохранить исходный код/настройки и идентификатор текущего deployment; запросить SHA рабочего дерева и убедиться, что это выбранный PR commit. Учебный Worker можно обновлять только после полного preflight выше. `keep_bindings` сохраняет прежний секрет; новая версия не должна добавлять DO migrations, routes или Cron. Сборка и тело upload:

```bash
npx esbuild scripts/l2-drill/repeat-worker.ts --bundle --format=esm --platform=browser --external:cloudflare:workers --loader:.sql=text --outfile="$workdir/worker.mjs"
cat > "$workdir/metadata.json" <<'JSON'
{"main_module":"worker.mjs","compatibility_date":"2026-11-16","keep_bindings":["secret_text"],"bindings":[{"type":"plain_text","name":"APP_ENV","text":"l2-drill"},{"type":"d1","name":"PLATFORM","database_id":"8e9a1210-1d84-4861-be7d-d051c81564d6"},{"type":"d1","name":"RESTORE_PLATFORM","database_id":"b6801517-bffe-4d3e-b46f-bb50c39f165a"},{"type":"r2_bucket","name":"MEDIA","bucket_name":"korzina-l2-drill-b-private"},{"type":"r2_bucket","name":"MEDIA_PUBLIC","bucket_name":"korzina-l2-drill-b-public"},{"type":"r2_bucket","name":"BACKUPS","bucket_name":"korzina-l2-drill-b-backups"},{"type":"r2_bucket","name":"RESTORE_MEDIA","bucket_name":"korzina-l2-drill-b-restore"},{"type":"durable_object_namespace","name":"SHOP_BINDING","class_name":"Shop"},{"type":"durable_object_namespace","name":"RESTORE_BINDING","class_name":"RestoreShop"}]}
JSON
curl -fsS -X PUT -H "Authorization: Bearer $CF_API_TOKEN" \
  -F "metadata=@$workdir/metadata.json;type=application/json" \
  -F "worker.mjs=@$workdir/worker.mjs;type=application/javascript+module" \
  "$api/workers/scripts/$worker" > "$workdir/upload.json"
jq -e '.success' "$workdir/upload.json" >/dev/null
```

После upload повторить settings/subdomain/schedules из §1 и сравнить оба DO namespace ID и каждый binding; секреты не считывать. При несовпадении СТОП, `workers.dev` не включать. API upload/команды не проверены на облаке в этой сессии; ошибка — СТОП с её точным текстом, не экспериментировать с миграциями.

## 3. Подготовка и один вызов

Только после успешной повторной сверки и проверки отсутствия параллельных запусков: на **restore UUID**, не на source, заменить скопированную метку и затем поставить четыре новые уникальные метки; для каждого R2 предварительно убедиться, что `.l2-drill-identity` отсутствует (404, а не ошибка доступа). Процедуру повторять после каждого успешного восстановления: оно копирует source-метку в restore и Worker удаляет четыре временные R2-метки. До каждого повтора заново сверять API bindings, ресурсы, содержимое и сохранённые ETag, чтобы исключить alias и чужие данные.

```bash
curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' \
  --data '{"sql":"UPDATE l2_drill_identity SET identity = ? WHERE identity = ?","params":["b6801517-bffe-4d3e-b46f-bb50c39f165a","8e9a1210-1d84-4861-be7d-d051c81564d6"]}' \
  "$api/d1/database/$dst/query" | jq -e '.success and .result[0].meta.changes == 1' >/dev/null
for suffix in private public backups restore; do
  bucket="korzina-l2-drill-b-$suffix"
  status=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CF_API_TOKEN" "$api/r2/buckets/$bucket/objects/.l2-drill-identity")
  test "$status" = 404
  printf %s "$bucket" | curl -fsS -X PUT -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/octet-stream' --data-binary @- "$api/r2/buckets/$bucket/objects/.l2-drill-identity" >/dev/null
done
```

Задать новый случайный `DRILL_TOKEN` только в секрет Worker через `PUT $api/workers/scripts/$worker/secrets` (`type: secret_text`, name `DRILL_TOKEN`); не выводить его. Убедиться, что доступен только этот Worker, `previews_enabled=false`. После этого включить `workers.dev` **только на время вызова**, гарантированно выключить в `trap` даже при ошибке:

```bash
DRILL_TOKEN=$(openssl rand -hex 32)
export DRILL_TOKEN
jq -n --arg token "$DRILL_TOKEN" '{name:"DRILL_TOKEN",type:"secret_text",text:$token}' |
  curl -fsS -X PUT -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' --data-binary @- "$api/workers/scripts/$worker/secrets" | jq -e '.success' >/dev/null
close_drill() {
  curl -fsS -X POST -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' --data '{"enabled":false,"previews_enabled":false}' "$api/workers/scripts/$worker/subdomain" | jq -e '.success' >/dev/null || return 1
  curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" "$api/workers/scripts/$worker/subdomain" | jq -e '.success and .result.enabled == false and .result.previews_enabled == false' >/dev/null
}
trap 'close_drill || printf "%s\n" "ОШИБКА: выключить workers.dev вручную и подтвердить GET" >&2' EXIT
curl -fsS -X POST -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' --data '{"enabled":true,"previews_enabled":false}' "$api/workers/scripts/$worker/subdomain" | jq -e '.success' >/dev/null
curl -fsS --max-time 120 -X POST -H "Authorization: Bearer $DRILL_TOKEN" 'https://korzina-l2-drill-b.vir2ozz2009.workers.dev/' | jq -e '.ok == true and .shops == 2 and .media == 2'
close_drill
trap - EXIT
unset DRILL_TOKEN
curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" "$api/workers/scripts/$worker/subdomain" | jq -e '.success and .result.enabled == false and .result.previews_enabled == false'
```

При успехе проверить новый `l2-drill-final/<timestamp>.json` в учебном backup-бакете, оба восстановленных магазина, учебный VND snapshot 45000 и outbox, unchanged source и семь старых ETag. Проверить повтор отдельно после повторного preflight и постановки меток; не путать его с повтором по таймауту: при неизвестном результате сначала прочитать новый приватный отчёт. Исходная demo-фикстура `sku-01` имеет остаток 2; каждый успешный учебный заказ расходует одну единицу. После двух заказов следующий запуск может получить 409. Перед дальнейшим прогоном отдельно проверить остаток и состояние своих учебных данных; исполнитель не пополняет товар автоматически. Если остаток исчерпан, не повторять вслепую и не изменять чужие данные. Если возникли ошибки/timeout, сохранять фактическую ошибку и остаток, не считать PASS и не удалять ресурсы. `scheduledBackup`, prod Cron, внешние уведомления, L1 2×50, алерты отсутствующей копии и полная стоимость этой процедурой не проверяются.
