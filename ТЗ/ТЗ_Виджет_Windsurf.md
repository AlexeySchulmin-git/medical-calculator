# ТЗ: Медицинский калькулятор-виджет
**Для Windsurf · Локальная разработка (XAMPP)**

---

## Что уже готово

- Next.js проект (без TypeScript, Tailwind, App Router, src/)
- Установлены: `mysql2`, `react-hook-form`, `nodemailer`, `lucide-react`, `axios`
- Таблицы БД: `clients`, `orders`, `address_cache`
- `src/lib/db.js` — пул соединений
- `.env.local` заполнен

---

## Стек

- **Next.js** — бэкенд + панель управления
- **MySQL (XAMPP)** — база данных
- **Preact + esbuild** — виджет (один бандл `public/widget.js`)
- **DaData API** — подсказки адресов и геокодинг

---

## Структура файлов (создать)

```
src/
  app/
    api/
      widget/config/route.js         — настройки по api_key
      dadata/suggest/route.js         — подсказки адресов с кэшем
      dadata/distance/route.js        — расчёт расстояния (Haversine)
      orders/route.js                 — создание заявки
      customers/bonus/route.js        — баланс бонусов по телефону
      notifications/email/route.js
      notifications/telegram/route.js
      notifications/sheets/route.js
    dashboard/
      page.js                         — дашборд
      orders/page.js
      settings/page.js
      integrations/page.js
      loyalty/page.js
      embed/page.js
  lib/
    db.js              — уже есть
    calculator.js      — логика расчёта цены
    notifications.js   — агрегатор уведомлений
  widget/
    index.js           — инициализация, Shadow DOM
    Calculator.js      — форма
    api.js             — запросы к серверу
    styles.css         — изолированные стили (CSS Variables)
widget-build.js        — esbuild конфиг (корень проекта)
public/widget.js       — готовый бандл (генерируется)
```

---

## Фаза 1 — Ядро

### GET /api/widget/config
- Читает заголовок `X-API-Key`
- Возвращает `settings` из таблицы `clients`
- Если ключ не найден или `active=0` → 401

Пример `settings` в БД:
```json
{
  "fields": { "floor": true, "diagnosis": true, "weight": true, "email": false, "medical_escort": true },
  "required": ["phone", "from_address", "to_address"],
  "pricing": { "base": 1500, "per_km": 45, "floor_fee": 150, "overweight_limit": 100, "overweight_fee": 500, "escort_fee": 1000 },
  "bonus": { "enabled": true, "percent": 5 },
  "personal_data_url": "/privacy",
  "telegram_chat_id": "123456",
  "sheets_id": "..."
}
```

### src/lib/calculator.js
```js
function calculatePrice({ distance, weight, floor, noElevator, roundTrip, medEscort, bonusUsed, settings }) {
  let price = settings.base + distance * settings.per_km;
  if (weight > settings.overweight_limit) price += settings.overweight_fee;
  if (noElevator && floor > 1) price += (floor - 1) * settings.floor_fee;
  if (medEscort) price += settings.escort_fee;
  if (roundTrip) price *= 1.8;
  const bonus_earned = settings.bonus.enabled ? Math.round(price * settings.bonus.percent / 100) : 0;
  const total = Math.round(price) - (bonusUsed || 0);
  return { subtotal: Math.round(price), bonus_earned, total };
}
```

### POST /api/dadata/suggest
- Принимает `{ query }`
- Проверяет `address_cache` (срок 7 дней)
- Если нет в кэше → запрос к DaData → сохранить в кэш
- Возвращает массив подсказок

### POST /api/dadata/distance
- Принимает `{ from_lat, from_lon, to_lat, to_lon }`
- Считает расстояние по формуле Haversine (без внешних API)

### POST /api/orders
- Принимает тело заявки + `X-API-Key`
- Валидирует обязательные поля из конфига
- Сохраняет в `orders`
- Вызывает `notifications.js`
- Возвращает `{ id, price }`

---

## Фаза 2 — Виджет

### Инициализация (index.js)
- Читает `data-key` со `<script>`-тега
- Создаёт Shadow DOM контейнер
- Вставляет стили
- Рендерит `Calculator`

### Поля формы (Calculator.js)
Управляются конфигом — каждое поле можно включить/выключить/сделать обязательным.

| Поле | Тип | Особенности |
|------|-----|-------------|
| from_address | text + autocomplete | DaData, debounce 300ms |
| to_address | text + autocomplete | При выборе → запрос расстояния |
| floor_num | number | Показывать только если `no_elevator = true` |
| no_elevator | checkbox | Показывает поле этажа |
| diagnosis | select | Список из конфига |
| weight | number | кг |
| phone | tel | Маска +7 (000) 000-00-00 |
| email | email | |
| round_trip | checkbox | Пересчитывает цену |
| payment_method | select | Наличные / Карта / Счёт |
| medical_escort | checkbox | |
| news_subscribe | checkbox | |
| personal_data | checkbox | Обязательное, ссылка из конфига |

**UX поведение:**
- После выбора адресов → показать блок: `расстояние X км, стоимость X ₽`
- Кнопка «Оставить заявку» появляется только после расчёта
- При вводе телефона → GET `/api/customers/bonus?phone=...` → показать баланс и чекбокс «Использовать бонусы»
- Инлайн-подсказки под полями (текст из конфига, без браузерных тултипов)
- После отправки → сообщение об успехе с номером заявки

### Стили (styles.css)
CSS Variables: `--wdg-primary`, `--wdg-bg`, `--wdg-font-size`, `--wdg-radius`. Все селекторы с префиксом `.wdg-` чтобы не конфликтовать с сайтом клиента.

### Сборка (widget-build.js)
```js
// npm install --save-dev esbuild preact
require('esbuild').build({
  entryPoints: ['src/widget/index.js'],
  bundle: true,
  minify: true,
  outfile: 'public/widget.js',
})
// Запуск: node widget-build.js
```

**Вставка на сайт клиента:**
```html
<script src="https://ваш-домен/widget.js" data-key="API_KEY"></script>
```

---

## Фаза 3 — Уведомления

### Email (nodemailer)
- Письмо менеджеру: новая заявка с деталями
- Письмо посетителю: подтверждение (если email указан)
- Настройки из `.env.local`

### Telegram
```
npm install node-telegram-bot-api
```
В конфиге клиента: `telegram_bot_token` + `telegram_chat_id`. Форматированное сообщение при новой заявке.

### Google Таблицы
```
npm install googleapis
```
В конфиге клиента: `sheets_id` + `sheet_name`. Новая строка при создании заявки: дата, адреса, цена, телефон, статус. Сервисный аккаунт → JSON-ключ в `.env.local`.

### Webhook (для CRM)
В конфиге клиента: `webhook_url`. POST с JSON заявки. Таймаут 5 сек, 1 retry. Совместимо с AmoCRM, Bitrix24.

---

## Фаза 4 — Система лояльности

### Добавить таблицы в БД
```sql
CREATE TABLE customers (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  phone VARCHAR(20) UNIQUE NOT NULL,
  fingerprint VARCHAR(64),
  bonus_balance DECIMAL(10,2) DEFAULT 0,
  subscribed_news TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bonus_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(36),
  order_id VARCHAR(36),
  amount DECIMAL(10,2),
  type ENUM('earned','spent'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Логика
- При вводе телефона → GET `/api/customers/bonus?phone=...` → баланс
- Идентификация: телефон — основной ключ; FingerprintJS — дополнительный (`npm install @fingerprintjs/fingerprintjs`)
- После заявки → начислить `bonusPercent %` от суммы
- В панели: включить/выключить бонусы, задать процент

---

## Фаза 5 — Панель управления

Маршруты `src/app/dashboard/`:

| Страница | Содержимое |
|----------|------------|
| `/` | Заявок сегодня, сумма, последние 10 |
| `/orders` | Таблица с фильтрами по дате и статусу |
| `/settings` | Поля, обязательность, тарифы расчёта |
| `/integrations` | Email, Telegram, Sheets, Webhook + тест |
| `/loyalty` | Вкл/выкл бонусы, процент |
| `/embed` | Готовый код вставки, лимиты тарифа |

Авторизация: `npm install next-auth`, credentials provider (email + пароль).

---

## Middleware (src/middleware.js)

Выполняется перед `/api/widget/*` и `/api/orders`:
- Читает `X-API-Key`
- Проверяет `clients`: `active=1`, подписка не истекла
- Увеличивает `requests_count`
- Если лимит превышен → 429
- Проверяет `Origin` против `clients.domain` для CORS

---

## Лицензирование (SaaS)

| Тариф | Расчётов/мес | Уведомления | Цена |
|-------|-------------|-------------|------|
| Basic | 500 | Email | 990 ₽/мес |
| Pro | 2 000 | Email + Telegram + Sheets | 2 490 ₽/мес |
| Enterprise | Безлимит | Всё + Webhook + White-label | от 4 990 ₽/мес |

Поля в `clients`: `subscription_expires`, `requests_count`, `requests_limit`.

---

## Порядок задач

| # | Задача | Зависит от |
|---|--------|-----------|
| 1 | esbuild конфиг + виджет в Shadow DOM | — |
| 2 | GET /api/widget/config | — |
| 3 | POST /api/dadata/suggest с кэшем | — |
| 4 | Haversine в calculator.js | — |
| 5 | calculatePrice в calculator.js | 4 |
| 6 | UI виджета: поля, автодополнение, расчёт | 2, 3, 5 |
| 7 | POST /api/orders | 2, 5 |
| 8 | Email уведомления | 7 |
| 9 | Telegram уведомления | 7 |
| 10 | Google Таблицы | 7 |
| 11 | Webhook | 7 |
| 12 | Бонусы: таблицы + API + UI | 7 |
| 13 | Панель управления | 1–12 |
| 14 | Middleware: ключи, лимиты, CORS | 2, 7 |
| 15 | Тест на WordPress, Tilda, голом HTML | 1–14 |

---

## Важно

- **Shadow DOM** — обязательно, полная изоляция от стилей сайта клиента
- **DaData кэш** — активно использовать, иначе легко исчерпать 10 000 запросов/сутки
- **Пересборка виджета** после изменений: `node widget-build.js`
- **Тест вставки локально**: создать `C:\xampp\htdocs\test.html` с тегом script
- **XAMPP**: Apache + MySQL должны быть запущены
