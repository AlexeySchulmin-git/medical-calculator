# 🚀 Быстрая справка по проекту
*Обновлено: 2026-02-21*

## 📋 Ключевые файлы
| Файл | Назначение | Быстрый доступ |
|------|------------|----------------|
| `medical-api-server.cjs` | **Основной сервер** (Express :3003, PostgreSQL) | `/api/orders`, `/api/calculate-price` |
| `src/widget/Calculator.jsx` | UI калькулятора (Preact) | `calculateDistance()`, `calculatePrice()` |
| `src/widget/api.js` | HTTP-клиент виджета, добавляет `x-api-key` | `fetch()`, `getConfig()`, `createOrder()` |
| `src/widget/index.jsx` | Регистрация `<medical-calculator>` custom element | `customElements.define()` |
| `src/lib/calculator.js` | LEGACY расчёт (Next.js routes, принимает `settings`) | `calculatePrice()`, `validateForm()` |
| `src/lib/notifications.js` | Email через Nodemailer (SMTP) | `sendOrderNotification()` |
| `src/lib/db.js` | MySQL pool (legacy Next.js) | `mysql.createPool()` |
| `widget-build.js` | ESBuild: `src/widget/` → `public/widget-calculator.js` | — |
| `start.bat` | Запуск Next.js :3000 + Express :3003 | — |
| `google-service-account.json` | Ключ Google Sheets API | — |

## 🎯 Частые задачи

### Изменить логику расчёта цены:
```
medical-api-server.cjs → function calculatePrice(data)  (~строка 1280)
```

### Изменить городской тариф (Москва +30%, Раменское фикс):
```
PostgreSQL: таблица pricing_city_rates
API: PUT /api/pricing/city-rates/:id
```

### Изменить базу перевозчика (стартовая точка маршрута):
```
PostgreSQL: company_settings → base_coords, base_address
API: (обновить через БД напрямую)
```

### Изменить UI виджета:
```
src/widget/Calculator.jsx → Preact компонент
```

### Добавить новый Express эндпоинт:
```
medical-api-server.cjs → app.post('/api/...', async (req, res) => {})
```

### Добавить новый Next.js API route:
```
src/app/api/[name]/route.ts → export async function POST()
```

### Настроить email уведомления:
```
medical-api-server.cjs → Resend (основной)
src/lib/notifications.js → Nodemailer (legacy)
```

### Пересобрать виджет после изменений:
```bash
node widget-build.js
```

## 🔥 Ключевые слова для grep
- **Расчёт цены**: `calculatePrice`, `cityRatesCache`, `kmPrice`
- **Расстояние/маршрут**: `dadata/distance`, `GraphHopper`, `base_coords`
- **Городские тарифы**: `pricing_city_rates`, `findCityRate`, `is_fixed_price`
- **Виджет**: `medical-calculator`, `customElements`, `WidgetAPI`
- **Заказы**: `/api/orders`, `order_number`, `ORD-`
- **Email**: `sendOrderNotification`, `Resend`, `nodemailer`
- **БД схема**: `CREATE TABLE`, `pricing_settings`, `company_settings`

## ⚡ One-liner команды
```bash
# Запустить всё
start.bat

# Собрать виджет после изменений
node widget-build.js

# Обновить CODEINDEX вручную
npm run index

# Автообновление CODEINDEX при изменениях файлов (запустить в отдельном терминале)
npm run index:watch
```

## 🚨 Критичные правила
1. **НЕ менять** структуру `src/` папок
2. **НЕ смешивать** CommonJS и ES modules (`.cjs` = CommonJS, `.ts/.js` в `src/` = ES modules)
3. **ВСЕГДА** валидировать `x-api-key` в headers Express эндпоинтов
4. **НЕ удалять** PostgreSQL таблицы без миграции
5. **Расчёт цены** — только через `medical-api-server.cjs::calculatePrice()`, не через `src/lib/calculator.js`
6. **Расстояние** — только через Express `/api/dadata/distance` (маршрут с базой), не через Next.js route

## ⚠️ Несоответствия в коде
1. `src/widget/api.js::calculateDistance()` — устарел, передаёт плоские поля; `Calculator.jsx` уже исправлен
2. `src/app/api/dadata/distance/route.ts` — legacy, считает только 2 точки без базы
3. `src/lib/calculator.js` — legacy, не используется основным сервером
