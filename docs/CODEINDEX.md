# Карта кодовой базы Medical Calculator
*Обновлено вручную: 2026-02-22. Следующее обновление: `npm run index` + ручная правка описаний.*

## 📊 СТАТИСТИКА
- **Express API эндпоинтов**: 18+ (medical-api-server.cjs)
- **Next.js API routes**: 8 (src/app/api/) — **LEGACY, не используются**
- **Виджет компонентов**: 4 (src/widget/)
- **Библиотек**: 3 (src/lib/) — **LEGACY, частично не используются**
- **Серверов**: 2 (Express :3003, Next.js :3000)

---

## 🗂️ ОСНОВНЫЕ МОДУЛИ

### 🔴 Ядро — Express сервер (порт 3003)

| Файл | Что делает | Эндпоинты / Функции |
|------|------------|---------------------|
| `medical-api-server.cjs` | Главный Express сервер, PostgreSQL, вся бизнес-логика | см. раздел API ниже |

**Функции внутри `medical-api-server.cjs`:**
| Функция | Назначение |
|---------|------------|
| `calculatePrice(data)` | Расчёт цены: км×тариф + городской коэфф/фикс + этажи + опции + roundTrip |
| `findCityRate(cityName)` | Поиск городского тарифа в `cityRatesCache` |
| `getFloorPrice(dir, weight)` | Тариф этажа по направлению и весу из `floorTiersCache` |
| `loadPricingSettings()` | Загрузка всех тарифов из БД в кэш при старте |
| `initializeDatabase()` | Создание таблиц и seed-данных при первом запуске |
| `sendOrderEmails(order)` | Email-уведомления менеджеру и клиенту (Resend) |
| `sendTelegramNotification(order, chatId)` | Telegram-уведомление о заявке |
| `appendOrderToSheet(order, spreadsheetId)` | Добавление новой заявки в Google Sheets |
| `upsertOrderInSheet(order, spreadsheetId)` | Обновление/добавление заявки в Google Sheets при редактировании |

---

### 🟡 Библиотеки (src/lib/)

| Файл | Что делает | Ключевые функции |
|------|------------|-----------------|
| `src/lib/calculator.js` | **LEGACY** — старая логика расчёта через `settings` объект (Next.js routes) | `calculatePrice({distance,weight,floor,settings})`, `calculateDistance()`, `validateForm()` |
| `src/lib/db.js` | MySQL connection pool (для Next.js routes, legacy) | `mysql.createPool()` — экспортирует `pool` |
| `src/lib/notifications.js` | Email через Nodemailer (SMTP) | `sendOrderNotification()`, `sendCustomerConfirmation()` |

> ⚠️ `src/lib/calculator.js` — **не используется** основным сервером. Основной расчёт в `medical-api-server.cjs::calculatePrice()`.

---

### 🟢 Виджет (src/widget/) — Preact, собирается в public/widget-calculator.js (84KB)

| Файл | Что делает | Ключевые функции |
|------|------------|-----------------|
| `src/widget/Calculator.jsx` | Главный компонент формы калькулятора | `calculateDistance()` → сервер, `calculatePrice()` → `/api/calculate-price` |
| `src/widget/index.jsx` | Регистрация `<medical-calculator>` custom element, загрузка конфига | `customElements.define('medical-calculator', ...)` |
| `src/widget/api.js` | HTTP-клиент виджета, добавляет `x-api-key` из `data-key` атрибута | `fetch()`, `getConfig()`, `createOrder()`, `getBonusBalance()` |

---

### 🔵 Админ и Суперадмин панели (public/) — управление заказами, клиентами и интеграциями

| Файл | Что делает | Ключевые функции |
|------|------------|-----------------|
| `public/admin.html` | Интерфейс админ-панели клиента | Заказы, тарифы, лояльность, Telegram/Sheets интеграции |
| `public/superadmin.html` | Интерфейс суперадмин панели | Клиенты, статистика, онбординг (`signup_requests`), админы |
| `public/superadmin.js` | JavaScript логика суперадмин панели | CRUD клиенты, лицензии, API ключи, фильтры, онбординг + пагинация |
| `src/widget/styles.css` | CSS виджета с переменными для кастомизации | CSS custom properties |

---

### 🔵 Next.js API routes (src/app/api/)

| Файл | Эндпоинт | Что делает |
|------|----------|------------|
| `src/app/api/dadata/suggest/route.ts` | `POST /api/dadata/suggest` | Автодополнение адресов через DaData API |
| `src/app/api/dadata/distance/route.ts` | `POST /api/dadata/distance` | Расстояние Haversine (только 2 точки, без базы — legacy) |
| `src/app/api/orders/route.ts` | `POST /api/orders` | Создание заказа через MySQL (legacy Next.js route) |
| `src/app/api/widget/config/route.js` | `GET /api/widget/config` | Конфигурация виджета |
| `src/app/api/notifications/email/test/route.js` | `POST /api/notifications/email/test` | Тест отправки email |
| `src/app/api/docs/beads/route.js` | `GET /api/docs/beads` | Список beads документации |
| `src/app/widget-config/route.js` | `GET /api/widget-config` | Альт. конфигурация виджета |
| `src/app/api/hello/route.js` | `GET /api/hello` | Health check |

---

### 🟣 Документация (src/docs/)

| Файл | Что делает |
|------|------------|
| `src/docs/beads/` | 29 beads — история изменений проекта (001–029) |
| `src/docs/lib/beads-parser.js` | Парсер markdown beads файлов: `parseAll()`, `parseBead()` |
| `src/docs/components/BeadsTimeline.jsx` | React-компонент таймлайна beads для страницы документации |
| `src/app/docs/page.jsx` | Страница `/docs` — отображение beads таймлайна |

---

### ⚙️ Инфраструктура

| Файл | Что делает |
|------|------------|
| `widget-build-prod.js` | ESBuild: собирает `src/widget/index.jsx` → `public/widget-calculator.js` |
| `beads-api-server.cjs` | Отдельный Express сервер для beads API |
| `start.bat` | Запускает Next.js + Express одновременно |
| `scripts/update-codeindex-simple.js` | Авто-сканер файлов для обновления этого файла (`npm run index`) |
| `scripts/watch-index.js` | File watcher: следит за `src/` и `.cjs`, запускает индексатор с debounce 1.5s (`npm run index:watch`) |
| `src/types/modules.d.ts` | TypeScript декларации для `@/lib/db`, `@/lib/calculator`, `@/lib/notifications` |
| `app/page.tsx` | Главная страница Next.js — рендерит `<medical-calculator>` виджет |
| `app/layout.tsx` | Root layout Next.js |

---

## 🌐 Express API эндпоинты (medical-api-server.cjs, порт 3003)

| Метод | Путь | Назначение |
|-------|------|------------|
| `POST` | `/api/calculate-price` | **Предварительный расчёт цены** без создания заказа (для виджета) |
| `POST` | `/api/orders` | Создание заказа: расчёт цены + сохранение в PostgreSQL + уведомления (бонусы списываются сразу, начисление откладывается до `completed`) |
| `PATCH` | `/api/orders/:id` | Обновление статуса заказа (admin), при переходе в `completed` применяется отложенное начисление бонусов |
| `POST` | `/api/dadata/distance` | Расстояние маршрута **База→Откуда→Куда→База** (GraphHopper→OSRM→Haversine) |
| `POST` | `/api/dadata/suggest` | Автодополнение адресов через DaData |
| `POST` | `/api/dadata/clean` | Автоисправление адресов через DaData Clean API |
| `GET`  | `/api/widget/config` | Конфиг виджета по API ключу |
| `GET`  | `/api/pricing` | Все тарифы (pricing_settings + floor_tiers + city_rates) |
| `POST` | `/api/pricing` | Обновление базовых тарифов |
| `GET`  | `/api/pricing/city-rates` | Городские коэффициенты и фиксированные цены |
| `POST` | `/api/pricing/city-rates` | Добавить городской тариф |
| `PUT`  | `/api/pricing/city-rates/:id` | Обновить городской тариф |
| `DELETE` | `/api/pricing/city-rates/:id` | Удалить городской тариф |
| `GET`  | `/api/pricing/floor-tiers` | Тарифы этажей по весу |
| `PUT`  | `/api/pricing/floor-tiers` | Обновление тарифов этажей |
| `GET`  | `/api/orders` | Список заказов (admin) |
| `GET`  | `/api/pricing/public` | Публичные тарифы без API ключа |
| `GET`  | `/api/company` | Настройки компании (база, координаты) |
| `PUT`  | `/api/company` | Обновление настроек компании |
| `GET`  | `/api/loyalty/settings` | Получить настройки лояльности клиента (`enabled`, `% начисления`, `% лимита списания`) |
| `PUT`  | `/api/loyalty/settings` | Сохранить настройки лояльности клиента |
| `POST` | `/api/telegram/webhook` | Вебхук для Telegram бота |

### 🔐 Суперадмин API эндпоинты (JWT авторизация)

| Метод | Путь | Назначение |
|-------|------|------------|
| `POST` | `/api/superadmin/auth` | Авторизация суперадмина (JWT) |
| `GET`  | `/api/superadmin/clients` | Список клиентов со статистикой заказов |
| `POST` | `/api/superadmin/clients` | Создание нового клиента |
| `PUT`  | `/api/superadmin/clients/:id` | Обновление данных клиента |
| `DELETE` | `/api/superadmin/clients/:id` | Удаление клиента |
| `POST` | `/api/superadmin/clients/:id/regenerate-key` | Генерация нового API ключа |
| `GET`  | `/api/superadmin/stats` | Общая статистика системы |
| `GET`  | `/api/superadmin/signup-requests` | Список заявок онбординга (`signup_requests`) с фильтром по статусу и пагинацией |
| `GET`  | `/api/superadmin/admins` | Список суперадминов |
| `POST` | `/api/superadmin/admins` | Создание суперадмина |
| `DELETE` | `/api/superadmin/admins/:id` | Удаление суперадмина |
| `GET`  | `/api/integrations` | Настройки интеграций клиента |
| `PUT`  | `/api/integrations` | Сохранение настроек интеграций |
| `GET`  | `/api/loyalty/balance` | Баланс бонусов по телефону |
| `GET`  | `/api/loyalty/customers` | Список клиентов лояльности (admin) |
| `GET`  | `/api/email/test` | Тест отправки email |
| `GET`  | `/api/telegram/test` | Тест Telegram бота |
| `GET`  | `/api/sheets/test` | Тест Google Sheets |
| `GET`  | `/api/test` | Health check endpoint |

---

## 🔔 Где искать уведомления (быстрый ориентир)

| Канал | Где реализовано | Когда вызывается |
|-------|------------------|------------------|
| Email (Resend) | `medical-api-server.cjs::sendOrderEmails()` | `POST /api/orders` (создание заявки) |
| Telegram | `medical-api-server.cjs::sendTelegramNotification()` | `POST /api/orders` (создание заявки) |
| Google Sheets (insert) | `medical-api-server.cjs::appendOrderToSheet()` | `POST /api/orders` (создание заявки) |
| Google Sheets (sync/update) | `medical-api-server.cjs::upsertOrderInSheet()` | `PATCH /api/orders/:id` (редактирование в админке) |

> Для поля даты поездки искать по ключу `trip_datetime` в `medical-api-server.cjs` и `public/admin.html` / `public/widget-calculator.js`.

---

## 🗄️ Структура PostgreSQL БД (medical-api-server.cjs)

| Таблица | Назначение | Ключевые поля |
|---------|------------|---------------|
| `pricing_settings` | Базовые тарифы | `per_km`, `waiting_30min`, `oxygen_fee`, `round_trip_value` |
| `pricing_city_rates` | Городские тарифы | `city_name`, `rate_type` (percent/fixed/flat_km), `value`, `is_fixed_price` |
| `pricing_floor_tiers` | Тарифы этажей по весу | `direction` (descent/ascent), `weight_from`, `weight_to`, `price_per_floor` |
| `company_settings` | Настройки компании | `base_address`, `base_coords` (координаты базы для маршрута) |
| `orders` | Заказы | `client_id`, `from_address`, `to_address`, `distance`, `price`, `status`, `bonus_used`, `bonus_earned`, `bonus_applied`, `bonus_applied_at` |
| `clients` | Клиенты (API ключи + лицензии) | `api_key`, `license_type`, `trial_until`, `paid_until`, `allowed_domains`, `company_name`, `contact_email` |
| `customers` | Программа лояльности | `client_id`, `phone` (нормализованный, 11 цифр), `bonus_balance`, `total_orders`, `total_spent` |

---

## 🔗 Граф зависимостей

```
Виджет (src/widget/Calculator.jsx)
  │── api.js (HTTP-клиент с x-api-key)
  │     ├── POST /api/dadata/suggest   → medical-api-server.cjs → DaData
  │     ├── POST /api/dadata/distance  → medical-api-server.cjs → GraphHopper/OSRM/Haversine
  │     │                                 маршрут: base_coords→from→to→base_coords
  │     ├── POST /api/calculate-price  → medical-api-server.cjs::calculatePrice()
  │     │                                 → cityRatesCache (PostgreSQL)
  │     └── POST /api/orders           → medical-api-server.cjs → PostgreSQL + Telegram + Sheets
  └── index.jsx → customElements.define('medical-calculator')

medical-api-server.cjs
  ├── PostgreSQL (orders, pricing_*, company_settings, clients)
  ├── Resend (email уведомления)
  ├── Google Sheets API (google-service-account.json)
  ├── Telegram Bot API
  └── DaData API (suggest)

Лояльность (актуальный поток):
  1) Виджет получает `bonus.max_usage_percent` из `GET /api/pricing/public`
  2) При `POST /api/orders` списание бонусов ограничивается формулой:
     `min(запрошено, баланс, floor(баланс * max_usage_percent / 100), цена)`
  3) Начисление не применяется сразу: сохраняется в `orders.bonus_earned`
  4) При `PATCH /api/orders/:id` и переходе в `completed` начисление применяется в `customers`

Next.js (порт 3000) — в основном legacy/admin
  ├── src/app/api/dadata/suggest → DaData API
  ├── src/app/api/dadata/distance → src/lib/calculator.js::calculateDistance() (только 2 точки!)
  ├── src/app/api/orders → src/lib/db.js (MySQL) — LEGACY
  └── src/app/docs → beads таймлайн
```

---

## 🚀 Запуск

```bash
start.bat          # Next.js :3000 + Express :3003
npm run dev        # только Next.js
npm run server     # только Express
npm run widget:build  # собрать виджет → public/widget-calculator.js
npm run index      # авто-обновить таблицу модулей (потом исправить описания вручную!)
```

---

## 📚 Внешние интеграции

| Сервис | Назначение | Где используется |
|--------|------------|-----------------|
| **DaData** | Автодополнение адресов | `medical-api-server.cjs`, `src/app/api/dadata/suggest/` |
| **GraphHopper** | Маршруты (приоритет 1) | `medical-api-server.cjs /api/dadata/distance` |
| **OSRM** | Маршруты (fallback 2) | `medical-api-server.cjs /api/dadata/distance` |
| **PostgreSQL** | Заказы, тарифы, клиенты | `medical-api-server.cjs` |
| **MySQL** | Legacy клиенты (Next.js) | `src/lib/db.js` |
| **Resend** | Email уведомления | `medical-api-server.cjs` |
| **Nodemailer** | Email (legacy Next.js) | `src/lib/notifications.js` |
| **Telegram Bot** | Уведомления о заказах | `medical-api-server.cjs` |
| **Google Sheets** | Запись заказов в таблицу | `medical-api-server.cjs`, `google-service-account.json` |

---

## ⚠️ Известные несоответствия (требуют внимания)

1. **Legacy Next.js routes**: `src/app/api/` содержит 8 эндпоинтов, которые не используются основным приложением. Весь функционал перенесён в Express сервер.
2. **Legacy библиотеки**: `src/lib/calculator.js`, `src/lib/db.js`, `src/lib/notifications.js` — не используются основным сервером, только для совместимости со старыми Next.js routes.
3. **Дублирование функционала**: Два расчёта расстояния (Next.js vs Express), два `calculatePrice`, два способа отправки email.
4. **Источник прод-виджета**: для отображения на главной и в тестах используется только `public/widget-calculator.js`.
