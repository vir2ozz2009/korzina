# Карта навигации первой версии

Каждый экран: маршрут, шаблон (`templates.md`), переход (`DESIGN.md` §4), эталонный кадр Figma и задача.
Эталоны взяты из сверенной карты экранов Lavka. Варианты состояний — в соседних кадрах того же блока (`SCREENS.md`).
Экраны дополнений (кэшбэк, истории, регулярные заказы…) сюда добавляются, когда их берут в работу.

## Оболочки

**Витрина (покупатель).** Нижней панели вкладок нет. Шапка: магазин (лого, название) + профиль. Плавающие кнопки внизу: поиск и корзина со счётчиком (на экранах `home`, `catalog`, `product`). Корень — главная; всё остальное — стек `push`/`sheet`. В Telegram BackButton виден на всех экранах, кроме главной.

**Кабинет (продавец), телефон.** Нижняя панель из 5 вкладок: Главная · Заказы · Товары · Деньги · Ещё. У каждой вкладки свой стек и своя сохранённая прокрутка; повторное нажатие на вкладку возвращает к её корню. «Покупатели», «Настройки» и (позже) «Рост» — внутри «Ещё». Десктоп: боковое меню — задача A16.

**Правила переходов.**
- `tab-root` — корень вкладки, без анимации сдвига; «назад» с корня: в витрине закрывает Mini App, в кабинете ничего не делает.
- `push` — справа налево, «назад» обратно; свайп от края.
- `sheet` — снизу; закрывается свайпом вниз, тапом по фону и «назад»; URL меняется, чтобы шторка открывалась ссылкой и закрывалась кнопкой Telegram.
- `replace` — заменяет текущий экран в истории (после оформления «назад» не возвращает в оплату, а ведёт на главную).
- `none` — точка входа по ссылке (приглашение, вход).
- Одна карточка на сущность: заказ продавца открывается одним маршрутом из рабочего дня, списка, денег, чата и уведомления Telegram.
- Возврат восстанавливает фильтр, выбранный день и позицию прокрутки списка.

## Витрина

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Главная | `/` | home | tab-root | [311:19906](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=311-19906) | B2 |
| Товары категории / бренда / все | `/c/$category, /b/$brand, /all` | catalog | push | [353:22844](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=353-22844) | B3 |
| Фильтры | `…/filters` | form | sheet | [581:47839](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=581-47839) | B3 |
| Сортировка | `…/sort` | form | sheet | [581:47925](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=581-47925) | B3 |
| Выбор фасовки с плитки | `?variants=$product` | sheet | sheet | — | B2 |
| Карточка товара | `/p/$slug` | product | push | [364:23999](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=364-23999) | B4 |
| Подробнее о товаре | `/p/$slug (шторка)` | sheet | sheet | — | B4 |
| Поиск | `/search` | catalog | push | [404:28301](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=404-28301) | B5 |
| Избранное | `/favorites` | catalog | push | [452:40344](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=452-40344) | B12 |
| О магазине | `/about` | form | push | [313:21175](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=313-21175) | B2 |

## Корзина и оформление

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Корзина | `/cart` | checkout | push | [90:5839](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=90-5839) | B6 |
| Вход и контакт | `/cart/login` | form | sheet | [165:10791](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=165-10791) | B9 |
| Получение | `/checkout` | checkout | push | [154:8020](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=154-8020) | B7 |
| Адрес доставки | `/checkout/address` | form | push | [96:5859](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=96-5859) | B7 |
| Детали адреса | `/checkout/address/details` | form | push | [161:10524](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=161-10524) | B7 |
| Комментарий курьеру | `/checkout/comment` | form | sheet | [161:10120](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=161-10120) | B7 |
| Выбор дня и времени | `/checkout/time` | form | sheet | [154:9062](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=154-9062) | B8 |
| Оплата и оформление | `/checkout/payment` | checkout | push | [186:9118](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=186-9118) | B10 |
| QR оплаты | `/checkout/payment/qr` | feedback | sheet | [187:9663](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=187-9663) | B10 |
| Помощь с оплатой | `/checkout/payment/help` | feedback | sheet | [187:10003](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=187-10003) | B10 |
| Заказ оформлен | `/orders/$id/done` | order | replace | [186:11072](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=186-11072) | B10 |

## Профиль и заказы покупателя

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Профиль | `/profile` | form | push | [283:18771](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=283-18771) | B11 |
| Личные данные / имя / контакт | `/profile/data, /name, /contact` | form | push | [283:21087](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=283-21087) | B11 |
| Сохранённые адреса | `/profile/addresses` | list | push | [283:22625](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=283-22625) | B7 |
| Адрес: просмотр / изменение | `/profile/addresses/$id, /edit, /new` | form | push | [283:23441](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=283-23441) | B7 |
| Уведомления | `/profile/notifications` | form | push | [283:31421](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=283-31421) | O4 |
| Мои заказы | `/orders` | list | push | [221:10879](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=221-10879) | B11 |
| Детали заказа | `/orders/$id` | order | push | [221:11008](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=221-11008) | B11 |
| Отмена заказа | `/orders/$id/cancel` | feedback | sheet | [206:11196](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=206-11196) | B11 |
| Доплата | `/orders/$id/topup` | checkout | push | [208:10502](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=208-10502) | O5 |
| Согласование замены | `/orders/$id/changes` | order | push | [245:13010](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=245-13010) | O6 |
| Изменение времени | `/orders/$id/reschedule` | form | push | [255:13882](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=255-13882) | O7 |
| Реквизиты возврата | `/orders/$id/refund` | form | push | [272:23818](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=272-23818) | O5 |
| Переписки | `/chats` | list | push | [267:15834](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=267-15834) | O8 |
| Чат по заказу | `/orders/$id/chat` | feedback | push | [267:16164](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=267-16164) | O8 |
| Фото в чате | `…/chat/media/$m` | feedback | sheet | [267:21336](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=267-21336) | O8 |

## Кабинет · Главная

Вкладка «Главная»

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Рабочий день | `/seller` | home | tab-root | [856:58544](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=856-58544) | S1, O3 |
| Первый запуск | `/seller/start` | form | push | [1094:63211](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=1094-63211) | S9 |
| Календарь получения | `/seller/calendar` | list | push | [856:58802](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=856-58802) | O3 |
| Список сборки | `/seller/assembly` | list | push | [833:59414](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=833-59414) | O3 |

## Кабинет · Заказы

Вкладка «Заказы»

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Заказы | `/seller/orders` | list | tab-root | [632:49972](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=632-49972) | O2 |
| Фильтры заказов | `/seller/orders/filters` | form | sheet | [643:51022](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=643-51022) | O2 |
| Карточка заказа | `/seller/orders/$id` | order | push | [632:51098](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=632-51098) | O2 |
| Передача / выдача | `…/$id/handoff` | feedback | sheet | [632:54371](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=632-54371) | O2 |
| Отмена продавцом | `…/$id/cancel` | feedback | sheet | [632:54573](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=632-54573) | O2 |
| Учёт оплаты | `…/$id/payment` | form | push | [632:54343](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=632-54343) | O5 |
| Реквизиты для возврата | `…/$id/refund-details` | form | push | [652:56784](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=652-56784) | O5 |
| Подтверждение возврата | `…/$id/refund` | form | push | [652:56803](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=652-56803) | O5 |
| Изменение состава | `…/$id/composition` | checkout | push | [668:52269](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=668-52269) | O6 |
| Выбор замены | `…/$id/composition/pick` | catalog | push | [668:52289](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=668-52289) | O6 |
| Новое время | `…/$id/reschedule` | form | push | [632:54543](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=632-54543) | O7 |
| Изменение адреса | `…/$id/address` | form | push | [638:57441](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=638-57441) | O7 |
| Чат по заказу | `…/$id/chat` | feedback | push | [632:54599](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=632-54599) | O8 |
| Переписки | `/seller/inbox` | list | push | [633:50748](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=633-50748) | O8 |

## Кабинет · Товары

Вкладка «Товары»

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Товары | `/seller/products` | list | tab-root | [748:55475](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=748-55475) | S2 |
| Товар: создать / изменить | `/seller/products/new, /$id` | form | push | [748:55491](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=748-55491) | S2 |
| Фасовки товара | `/seller/products/$id/variants` | list | push | [741:55236](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=741-55236) | S2 |
| Фасовка | `…/variants/$v` | form | push | [741:55244](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=741-55244) | S2 |
| Остаток | `…/variants/$v/stock` | form | sheet | [743:55307](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=743-55307) | S2 |
| Категории | `/seller/categories` | list | push | [780:58701](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=780-58701) | S3 |
| Категория | `/seller/categories/$id` | form | push | [780:58768](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=780-58768) | S3 |
| Товары категории / бренда | `…/$id/products` | catalog | push | [783:57466](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=783-57466) | S3 |
| Перенос при удалении | `…/$id/move` | form | sheet | [783:57613](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=783-57613) | S3 |
| Бренды / бренд | `/seller/brands, /$id` | list / form | push | [780:59638](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=780-59638) | S3 |

## Кабинет · Деньги

Вкладка «Деньги»

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Обзор денег (финансовые задачи) | `/seller/money` | home | tab-root | [886:58726](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=886-58726) | O5 |
| Операции | `/seller/money/operations` | list | push | [886:59797](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=886-59797) | O5 |

## Кабинет · Ещё и настройки

Вкладка «Ещё»

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Ещё | `/seller/more` | list | tab-root | [822:58260](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=822-58260) | S1 |
| Настройки | `/seller/settings` | list | push | [1567:72327](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=1567-72327) | S1 |
| Получение: обзор | `/seller/settings/receiving` | form | push | [682:52344](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=682-52344) | S4 |
| Условия доставки | `…/receiving/delivery` | form | push | [682:52275](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=682-52275) | S4 |
| Территория | `…/delivery/territory` | form | push | [686:67210](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=686-67210) | S4 |
| Карта зоны | `…/delivery/map` | form | push | [686:67215](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=686-67215) | S4 |
| Цена доставки | `…/delivery/price` | form | sheet | [686:67632](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=686-67632) | S4 |
| Расписание | `…/receiving/schedule` | form | push | [682:52323](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=682-52323) | S4 |
| Рабочие часы | `…/schedule/hours` | form | push | [699:50003](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=699-50003) | S4 |
| Подготовка и лимиты | `…/schedule/limits` | form | push | [699:50020](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=699-50020) | S4 |
| Особые даты | `…/schedule/exceptions` | form | push | [699:49992](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=699-49992) | S4 |
| Окно получения | `…/schedule/interval` | form | sheet | [699:50072](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=699-50072) | S4 |
| Самовывоз | `…/receiving/pickup` | form | push | [682:52305](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=682-52305) | S4 |
| Адрес пункта | `…/pickup/address` | form | push | [713:53942](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=713-53942) | S4 |
| Проверка и применение | `…/receiving/review` | checkout | push | [717:54079](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=717-54079) | S4 |
| Способы оплаты | `/seller/settings/payments` | list | push | [723:54151](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=723-54151) | S5 |
| Тип оплаты | `…/payments/new` | form | sheet | [729:54184](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=729-54184) | S5 |
| Реквизиты способа | `…/payments/$id` | form | push | [729:54192](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=729-54192) | S5 |
| Проверка и применение | `…/payments/review` | checkout | push | [729:54216](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=729-54216) | S5 |
| Оформление витрины (пресеты цвета) | `/seller/settings/appearance` | form | push | [1110:64305](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=1110-64305) | S6 |
| Данные магазина | `/seller/settings/store` | form | push | [903:59118](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=903-59118) | S6 |
| Контакты | `…/store/contacts` | form | push | [903:60541](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=903-60541) | S6 |
| Регион, валюта, время | `…/store/region` | form | push | [903:60934](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=903-60934) | S6 |
| Выбор страны / пояса / валюты | `…/region/country|timezone|currency` | catalog | sheet | [904:59886](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=904-59886) | S6 |
| Бот магазина | `/seller/settings/bot` | form | push | [916:59971](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=916-59971) | S7 |
| Рабочая группа | `…/bot/workgroup` | form | push | [916:61042](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=916-61042) | S7 |
| События уведомлений | `…/bot/events` | form | push | [916:61489](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=916-61489) | O4 |
| Команда | `/seller/settings/team` | list | push | [928:62804](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=928-62804) | S8 |
| Добавить сотрудника | `…/team/new` | form | push | [928:61647](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=928-61647) | S8 |
| Сотрудник | `…/team/$id` | form | push | [928:62907](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=928-62907) | S8 |
| Уровень доступа / ручные права | `…/$id/access` | form | push | [923:69487](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=923-69487) | S8 |
| Приглашение | `…/team/invite/$id` | form | push | [923:70909](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=923-70909) | S8 |
| Принять приглашение | `/seller/invite/$token` | form | none | [928:62435](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=928-62435) | S8 |
| Вход по почте | `/seller/login` | form | none | [928:62702](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=928-62702) | S8 |

## Админка платформы

Оболочка: бренд Korzina (не цвет магазина), без вкладок; на телефоне — стек экранов, на десктопе — колонка по центру (отдельный десктоп — A16). Макетов нет: собирать из кита по шаблонам в стиле кабинета продавца и показывать Андрею на холсте MagicPath.

| Экран | Маршрут | Шаблон | Переход | Эталон | Задача |
|---|---|---|---|---|---|
| Вход администратора | `/admin/login` | form | none | — | AD1 |
| Магазины (список, счётчики, поиск) | `/admin` | list | tab-root | стиль 632:49972 | AD1 |
| Новый магазин · шаг 1 «Магазин» | `/admin/shops/new` | form | push | стиль 903:59118 | AD1 |
| Новый магазин · шаг 2 «Регион и оформление» | `/admin/shops/new/region` | form | push | стиль 903:60934 | AD1 |
| Новый магазин · шаг 3 «Владелец» | `/admin/shops/new/owner` | form | push | стиль 928:61647 | AD1 |
| Магазин создан (ссылка, QR, инструкция) | `/admin/shops/$id/created` | order | replace | стиль 186:11072 | AD1 |
| Карточка магазина | `/admin/shops/$id` | order | push | стиль 632:51098 | AD2 |
| Подключение токена администратором | `/admin/shops/$id/bot` | form | push | [916:60122](https://www.figma.com/design/Y8MsoSYwEr373vVvlvXAGJ/?node-id=916-60122) | S7 |
| Смена статуса (причина, подтверждение) | `/admin/shops/$id/status` | feedback | sheet | — | AD2 |
| Дополнения магазина | `/admin/shops/$id/features` | list | push | — | AD2 |
| Владелец и приглашение | `/admin/shops/$id/owner` | form | push | стиль 923:70909 | AD2 |
| Адрес витрины | `/admin/shops/$id/address` | form | push | — | AD3 |
| Журнал (общий / магазина) | `/admin/audit`, `/admin/shops/$id/audit` | list | push | — | AD3 |

## Сквозные маршруты (проверять целиком)

1. Главная → товар → «+» → корзина → получение → адрес → время → оплата → «Заказ оформлен» → мои заказы (B12, e2e).
2. Telegram-уведомление продавцу → карточка заказа → передача → выдача; покупатель видит статус (O2, O4).
3. Рабочий день → ближайший заказ → сборка → к передаче; «назад» возвращает к тому же дню (O3).
4. Деньги → задача «проверить перевод» → карточка заказа → учёт оплаты → назад в деньги (O5).
5. Товары → добавить → категория создаётся из формы без потери полей → сохранить → каталог (S2–S3).
6. Главная кабинета → первый запуск → товары → получение → оплата → бот → открыть магазин (S9).
7. Админка → новый магазин → ссылка-приглашение → продавец входит → первый запуск → магазин активен; в админке статус «активен» (AD1, S9).
