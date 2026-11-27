> Исторический снимок main c211708 до CTX-1; прежние команды и СТОПы не являются текущим заданием. Актуальное состояние — [PROGRESS](../../../PROGRESS.md).

### Шаги блока 9 · Рабочий день и уведомления

Порядок — `docs/specs/README.md`. Карточки O3, O4 сверены, решения Андрея 22.11.2026 — в карточках и DECISIONS. Блок 8 принят.

Исправления по demo-проверке и §15.1 покрыты регрессиями 01–05. [PR #200](https://github.com/vir2ozz2009/korzina/pull/200).

[Перепроверка #198](../../block9-recheck.md): регрессии 06–08 закрепляют отправку ссылок, оформление без времени и скрытие сумм. BL-12 и BL-11 записаны в бэклоге в [#201](https://github.com/vir2ozz2009/korzina/pull/201).

23.11.2026 · [Регрессия 09, §15.1](../../block9-recheck.md#23-ноября--регрессия-09): браузер с загруженным Telegram SDK и пустым `initData` копирует ссылку при недоступной системной отправке.

- [x] [Спецификация O3–O4](../../../specs/workday-notifications.md) подготовлена 22.11.2026. Ответы Андрея в §11 и правки холста в §12–§14 покрыты строками §7. [PR #186](https://github.com/vir2ozz2009/korzina/pull/186) · [PR #189](https://github.com/vir2ozz2009/korzina/pull/189) · [PR #190](https://github.com/vir2ozz2009/korzina/pull/190) · [PR #191](https://github.com/vir2ozz2009/korzina/pull/191).
- [x] Андрей одобрил 22.11.2026 холст блока 9 по §13 и §14 из `main 6f13a5b`, ревизия `475172126249336832`. [Холст](https://designs.magicpath.ai/v1/vibrant-creek-7051?revisionId=475172126249336832&history=design) · [Отчёт](../../workday-notifications-canvas.md) · [PR #187](https://github.com/vir2ozz2009/korzina/pull/187).
- [x] O4, O3 и экраны на demo `510af1d`. Check, preview smoke и Demo smoke прошли. [O4 #192](https://github.com/vir2ozz2009/korzina/pull/192) · [O3 и экраны #193](https://github.com/vir2ozz2009/korzina/pull/193) · [Demo smoke](https://github.com/vir2ozz2009/korzina/actions/runs/45008912544).
- [x] Подготовлен [чек-лист локальной проверки](../../workday-notifications-local-check.md) с таблицей покрытия и снимками. **СТОП:** «➡️ Локальный Codex».

- [x] [Перепроверка блока 9](../../workday-notifications-demo-check.md) на demo `76e6e34` подтверждена в Chrome и принята Андреем 23.11.2026. [PR #198](https://github.com/vir2ozz2009/korzina/pull/198).
- [x] BL-12 · Явные отметки изменений, лимит длины файлов и совпавшие снимки на 390 px. [PR #205](https://github.com/vir2ozz2009/korzina/pull/205) · [Demo smoke](https://github.com/vir2ozz2009/korzina/actions/runs/45118013614).
- [x] BL-11 · 10 сценариев Playwright, проверка приглашения, разбор падений и workflow очистки превью. Для запуска очистки нужен секрет GitHub Actions. [PR #207](https://github.com/vir2ozz2009/korzina/pull/207) · [Отчёт](../../BL-11.md). **СТОП.**

