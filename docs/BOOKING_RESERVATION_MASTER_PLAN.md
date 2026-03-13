# План внедрения модуля бронирования (Restaurant-first, с расширением на другие сферы)

Дата фиксации: 14 марта 2026  
Статус: План + сохраненный контекст исследования  
Назначение: чтобы команда могла продолжить работу с любого этапа, даже если текущая сессия прервется.

---

## 1) Что уже изучено в проекте

### Backend (подтверждено по коду)
- Базовый поток заказов:
  - `server/routes/orders.js` — создание заказа, расчеты, уведомления.
  - `server/routes/admin.js` — список заказов, принятие с оплатой (`accept-and-pay`), смена статусов.
- Биллинг магазина:
  - `restaurants.balance`, `restaurants.order_cost`.
  - Транзакции в `billing_transactions`.
- Payme сильно привязан к `orders`:
  - `server/routes/payme.js`.
- Telegram-уведомления и формат карточки заказа завязаны на `orders`:
  - `server/bot/notifications.js`.
- Виды деятельности уже есть:
  - `restaurants.activity_type_id`.
  - Справочник `business_activity_types` в `server/routes/superadmin.js`.

### Frontend (подтверждено по коду)
- Клиентские маршруты: `client/src/App.jsx` (`/`, `/cart`, `/orders`, `/favorites`, `/feedback`).
- Нижнее меню клиента: `client/src/components/BottomNav.jsx`.
- Оформление заказа: `client/src/pages/Cart.jsx`.
- История заказов клиента: `client/src/pages/Orders.jsx`.
- Операторская админка заказов (list + kanban + деталка): `client/src/pages/AdminDashboard.jsx`.
- Суперадмин настраивает магазины и виды деятельности: `client/src/pages/SuperAdminDashboard.jsx`.

### Ключевой вывод
Существующая логика `orders` насыщенная и связанная (статусы, биллинг, Payme, Telegram).  
Чтобы не ломать прод-логику, бронь нужно добавлять отдельным модулем, а не как “еще один тип заказа” внутри текущего `orders`.

---

## 2) Цель внедрения

Сделать для магазинов с видом деятельности **“Ресторан”**:
- визуальное бронирование столов по этажам;
- выбор даты/времени и нескольких столов;
- режимы:
  - только бронь (фиксированная сумма с клиента),
  - бронь + блюда (предоплата по правилам магазина);
- списание сервисной стоимости с баланса магазина аналогично заказам;
- операторское управление этажами/фото/схемой/столами.

Параллельно заложить архитектуру, которую можно расширить на автосервисы, врачей, юристов и т.д.

---

## 3) Архитектурное решение (рекомендуемое)

## 3.1 Принцип
- **Новая доменная область**: `reservations` (отдельные таблицы + API + UI).
- `orders` оставить как есть, но добавить мягкую связь с бронью там, где нужно.

## 3.2 Почему так безопаснее
- Не ломаем текущие сценарии корзины/заказов/оплаты.
- Можно запускать поэтапно (фича-флагом для ресторанов).
- Проще откатить бронь без риска для основного потока заказов.

---

## 4) Изменения в БД (план)

## 4.1 Новые таблицы
- `restaurant_reservation_settings`
  - `restaurant_id PK/FK`
  - `enabled boolean`
  - `reservation_fee numeric(12,2)` — фикс для брони
  - `reservation_service_cost numeric(12,2)` — списание с баланса магазина за бронь
  - `max_duration_minutes int`
  - `allow_multi_table boolean`
  - `prepay_mode varchar` (`none|fixed|percent`)
  - `prepay_percent numeric(5,2)`
  - `created_at`, `updated_at`

- `reservation_floors`
  - `id PK`
  - `restaurant_id FK`
  - `name`
  - `sort_order`
  - `image_url` (фото/план этажа)
  - `is_active`
  - timestamps

- `reservation_table_templates`
  - `id PK`
  - `code` (например `table_round_4`)
  - `name`
  - `shape` (`round|square|rect|sofa|custom`)
  - `seats_count`
  - `width`, `height` (условные единицы)
  - `is_system`
  - timestamps

- `reservation_tables`
  - `id PK`
  - `restaurant_id FK`
  - `floor_id FK`
  - `template_id FK`
  - `name` (номер столика)
  - `capacity`
  - `x`, `y` (позиция на плане)
  - `rotation`
  - `is_active`
  - timestamps

- `reservations`
  - `id PK`
  - `restaurant_id FK`
  - `user_id FK`
  - `reservation_number unique`
  - `status` (`new|confirmed|seated|completed|cancelled|no_show`)
  - `booking_date date`
  - `start_time time`
  - `end_time time`
  - `guests_count int`
  - `booking_mode` (`reservation_only|with_items`)
  - `reservation_fee numeric(12,2)`
  - `items_prepay_amount numeric(12,2)`
  - `service_fee numeric(12,2)`
  - `total_prepay_amount numeric(12,2)`
  - `payment_method`
  - `payment_status`
  - `is_paid`, `paid_amount`
  - `comment`
  - `processed_by`, `processed_at`
  - `cancel_reason`, `cancelled_at_status`
  - timestamps

- `reservation_tables_map` (многие-ко-многим)
  - `id PK`
  - `reservation_id FK`
  - `table_id FK`
  - `created_at`

- `reservation_status_history`
  - аналог `order_status_history`.

## 4.2 Мягкая интеграция с заказами
- Добавить в `orders`:
  - `source_type varchar(20) default 'order'` (`order|reservation`)
  - `reservation_id int null`
- Нужна для аналитики и быстрой навигации “из заказа в бронь”.

## 4.3 Биллинг
- В `restaurants` добавить:
  - `reservation_cost numeric(12,2) default 0`
- В `billing_transactions` пока можно не менять схему, но в `description` фиксировать:
  - `Списание за бронь #<id>`
- Опционально 2-я итерация: добавить `entity_type/entity_id` в `billing_transactions`.

---

## 5) API (план)

## 5.1 Публичные/клиентские
- `GET /api/reservations/availability`
  - вход: `restaurant_id`, `date`, `time_from`, `duration`, `floor_id`
  - выход: список столов + статусы занятости.
- `POST /api/reservations`
  - создание брони (со списком столов, режимом, предоплатой).
- `GET /api/reservations/my`
  - список броней клиента.
- `POST /api/reservations/:id/cancel`
  - отмена клиентом (по правилам).

## 5.2 Оператор/админ
- `GET /api/admin/reservations`
- `PATCH /api/admin/reservations/:id/status`
- `GET /api/admin/reservations/status-counts`
- `POST /api/admin/reservations/:id/accept-and-pay`
  - списание сервисной стоимости брони с баланса магазина.
- CRUD этажей:
  - `GET/POST/PUT/DELETE /api/admin/reservation-floors`
- CRUD столов:
  - `GET/POST/PUT/DELETE /api/admin/reservation-tables`
- Настройки брони:
  - `GET/PUT /api/admin/reservation-settings`

## 5.3 Суперадмин
- Управление системными шаблонами столов:
  - `GET/POST/PUT /api/superadmin/reservation-table-templates`
- Массовое включение/отключение модуля по видам деятельности (опционально).

---

## 6) UI (план “где добавлять”)

## 6.1 Клиент
- Новый маршрут: `client/src/pages/Reservations.jsx`.
- Добавить роут в `client/src/App.jsx`.
- Добавить пункт “Бронирование” в `client/src/components/BottomNav.jsx`:
  - показывать только если активный магазин поддерживает брони.
- Визуальные цвета:
  - свободные столы: пастельно-зеленый;
  - занятые: светло-серый;
  - выбранные: акцентный цвет темы.
- Экран:
  - выбор этажа;
  - выбор даты/времени;
  - схема столов;
  - множественный выбор столов;
  - опция “только бронь” или “бронь + блюда”.

## 6.2 Оператор (AdminDashboard)
- Новый таб `reservations` в `client/src/pages/AdminDashboard.jsx`.
- Блоки:
  - список броней (status filters, даты);
  - канбан/лист по статусам (по аналогии с orders можно постепенно);
  - карточка брони;
  - редактор этажей и столов (floor image + drag/drop столов).

## 6.3 Суперадмин
- В `client/src/pages/SuperAdminDashboard.jsx`:
  - секция системных шаблонов столов;
  - настройка стоимости сервиса брони по умолчанию.

---

## 7) Бизнес-логика и правила

## 7.1 Доступность по виду деятельности
- На первом этапе включаем UI брони только для магазинов с activity type “Ресторан”.
- Проверка нужна и на backend (не только в UI).

## 7.2 Антиколлизии слотов
- При создании брони:
  - транзакция БД;
  - блокировка выбранных столов (`FOR UPDATE`);
  - проверка пересечений интервалов времени;
  - только после этого запись брони.

## 7.3 Оплата
- Клиент платит:
  - `reservation_only`: фикс брони.
  - `with_items`: товары + бронь + сервис.
- Магазин платит платформе:
  - `reservation_cost` со своего баланса при подтверждении/принятии брони.

## 7.4 Статусы
- Предложение статусов:
  - `new` -> `confirmed` -> `seated` -> `completed`
  - ветка отмены: `cancelled`
  - отдельный `no_show` при неявке.

---

## 8) План работ по этапам

## Этап 0. Подготовка (без UI)
- [ ] Создать миграции таблиц бронирования.
- [ ] Добавить поля интеграции в `orders` (`source_type`, `reservation_id`).
- [ ] Добавить `restaurants.reservation_cost`.
- [ ] Подготовить seed системных шаблонов столов.

## Этап 1. API ядро бронирования
- [ ] `GET availability`, `POST reservation`, `GET my`.
- [ ] Админские endpoints для статусов и принятия с биллингом.
- [ ] История статусов брони.
- [ ] Логи активности по аналогии с orders.

## Этап 2. Операторская часть
- [ ] Таб “Бронирования” в AdminDashboard.
- [ ] CRUD этажей.
- [ ] CRUD столов + визуальное размещение.
- [ ] Деталка брони + действия по статусам.

## Этап 3. Клиентская часть
- [ ] Страница `Reservations.jsx`.
- [ ] Пункт в BottomNav по условию.
- [ ] Выбор этажа/даты/времени/столов.
- [ ] Режим “бронь + блюда”.

## Этап 4. Оплата и уведомления
- [ ] Поддержка payme/card/cash (по правилам магазина).
- [ ] Telegram-сообщения по броням.
- [ ] Уведомления о списании сервисной стоимости.

## Этап 5. Аналитика и отчеты
- [ ] Счетчики броней по статусам.
- [ ] Выручка по броням.
- [ ] Связка бронь <-> заказ (где применимо).

---

## 9) Риски и как не поломать систему

- Риск: затронуть `orders` и сломать текущий поток.
  - Мера: бронь отдельной сущностью; в `orders` только мягкая ссылка.
- Риск: двойное бронирование одного стола.
  - Мера: транзакции + блокировки + проверка overlap.
- Риск: несогласованность оплат.
  - Мера: отдельный payment-status lifecycle для `reservations`.
- Риск: деградация админки из-за большого файла `AdminDashboard.jsx`.
  - Мера: вынос логики брони в отдельные компоненты/хуки.

---

## 10) Критерии готовности (MVP)

- Клиент может выбрать этаж, время и 1+ столов.
- Система не дает забронировать занятый стол.
- Оператор видит брони, подтверждает, меняет статусы.
- С баланса магазина списывается сервисная стоимость брони.
- История/статусы/логирование работают стабильно.
- Текущая логика заказов не сломана.

---

## 11) Открытые решения (нужно подтвердить перед кодом)

1. Размер фиксированной предоплаты за бронь (одинаковый или по магазину/времени).  
2. Правило предоплаты для режима “бронь + блюда” (процент/фикс/полная).  
3. Политика отмены и возврата (по времени до брони).  
4. Можно ли объединять несколько столов разных этажей в одну бронь (обычно нет).  
5. Нужен ли отдельный Telegram-ботовый поток для броней сразу или во 2-й итерации.

---

## 12) Как продолжать, если сессия оборвется

Открой этот файл и продолжай по этапам сверху вниз.

Минимальный стартовый пакет задач для следующей сессии:
1. Сделать миграцию БД для таблиц `reservation_*` и полей интеграции.
2. Поднять backend CRUD для этажей/столов.
3. Реализовать `GET availability` + `POST reservation` с защитой от коллизий.

Рекомендуемый формат прогресса в каждой новой сессии:
- `Сделано: ...`
- `В работе: ...`
- `Блокеры: ...`
- `Следующий шаг: ...`

---

## 13) Сводка для команды

Система готова к внедрению бронирования без поломки текущей логики, если идти через отдельный модуль `reservations` и не смешивать ядро со старым `orders`.  
Основной технический акцент: корректная модель времени/слотов, транзакционная защита от двойной брони и аккуратная интеграция биллинга.

---

## 14) Фактический прогресс в ветке `feat/booking-reservations` (14 марта 2026)

### Уже реализовано
- Backend:
  - добавлен `server/services/reservationSchema.js` с созданием таблиц:
    - `restaurant_reservation_settings`
    - `reservation_floors`
    - `reservation_table_templates` (с системными шаблонами)
    - `reservation_tables`
    - `reservations`
    - `reservation_tables_map`
    - `reservation_status_history`
  - добавлены интеграции:
    - `restaurants.reservation_cost`
    - `orders.source_type`
    - `orders.reservation_id`
  - миграция подключена в `server/database/migrate.js`.
  - клиентские API: `server/routes/reservations.js`
    - `GET /api/reservations/floors`
    - `GET /api/reservations/availability`
    - `GET /api/reservations/my`
    - `POST /api/reservations`
    - `POST /api/reservations/:id/cancel`
  - операторские API: `server/routes/adminReservations.js`
    - настройки, этажи, шаблоны, столы, список броней, смена статусов, `accept-and-pay`.
  - в модели столов добавлены:
    - `capacity`
    - `photo_url`
  - в `POST /api/reservations` добавлена серверная проверка:
    - суммарная вместимость выбранных столов >= `guests_count`.

- Frontend клиент:
  - добавлена страница `client/src/pages/Reservations.jsx`:
    - выбор этажа/даты/времени/длительности/типа брони;
    - визуальный выбор столов;
    - цвета статусов (свободно/занято/выбрано);
    - фото стола открывается по иконке камеры (не показывается сразу);
    - отображение и проверка вместимости;
    - создание брони.
  - подключен маршрут `/reservations` в `client/src/App.jsx`.
  - добавлен пункт в `client/src/components/BottomNav.jsx`.
  - добавлен `/reservations` в `client/src/components/ClientRoutePersistence.jsx`.

- Frontend оператор:
  - добавлена отдельная страница `client/src/pages/AdminReservations.jsx`.
  - подключен маршрут `/admin/reservations` в `client/src/App.jsx`.
  - на странице оператора есть:
    - настройки брони;
    - добавление этажей с `image_url` (фото/схема);
    - добавление столов с `capacity` и `photo_url`;
    - список броней и действия по статусу;
    - подтверждение брони с биллинговым списанием (`accept-and-pay`).

### Что осталось доделать (следующий приоритет)
1. Добавить заметную навигацию из основной `AdminDashboard.jsx` на `/admin/reservations` (кнопка/таб).
2. Связать режим `with_items` с реальным выбором блюд из каталога и расчетом `items_prepay_amount`.
3. Добавить/уточнить поток оплат для бронирований через Payme (если нужен в MVP).
4. Добавить Telegram-уведомления по броням (клиент/оператор).
5. Закрыть автотестами критичные сценарии:
   - коллизии времени;
   - недостаточная вместимость;
   - списание с баланса магазина и обработка недостаточного баланса.
