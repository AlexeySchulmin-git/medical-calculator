---
title: "Telegram-бот, Google Sheets, CSS-переменные виджета"
date: "2026-02-19"
author: "Cascade"
tags: ["telegram", "google-sheets", "widget", "css", "notifications", "integration"]
status: "completed"
related: ["018-widget-admin-fixes.md"]
files_modified:
  - "medical-api-server.cjs"
  - "public/widget-calculator.js"
files_created:
  - ".env.local.example"
---

## Что сделано

### 1. Telegram-бот — уведомления о новых заявках
Функция `sendTelegramNotification(order)` в `medical-api-server.cjs`:
- Отправляет форматированное Markdown-сообщение при каждой новой заявке
- Содержит: номер заявки, телефон, email, имя, маршрут, расстояние, цену, вес, диагноз, опции (спуск/подъём/кислород/туда-обратно), комментарий
- Использует нативный `https` без доп. зависимостей
- Не блокирует ответ клиенту (`.catch()`)

Переменные в `.env.local`:
```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Тест: `GET /api/telegram/test`

### 2. Google Sheets — автозапись заявок
Функция `appendOrderToSheet(order)` через `googleapis`:
- Добавляет строку в таблицу при каждой новой заявке
- Колонки: дата, номер, телефон, email, имя, откуда, куда, км, цена, вес, диагноз, спуск, подъём, мед.сопр, кислород, туда-обратно, комментарий, статус
- Инициализация при старте сервера через `initGoogleSheets()`
- Graceful fallback если не настроено

Переменные в `.env.local`:
```
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-service-account.json
GOOGLE_SPREADSHEET_ID=...
GOOGLE_SHEET_NAME=Заявки
```

Тест: `GET /api/sheets/test`

Установлен пакет: `googleapis`

### 3. CSS-переменные виджета — кастомизация через атрибуты
Все цвета и размеры вынесены в CSS custom properties в `:host`:

| Атрибут | CSS-переменная | По умолчанию |
|---|---|---|
| `primary-color` | `--w-primary` | `#3b82f6` |
| `primary-dark` | `--w-primary-dark` | `#2563eb` |
| `bg-color` | `--w-bg` | `#ffffff` |
| `border-radius` | `--w-radius` | `16px` |
| `input-radius` | `--w-input-radius` | `8px` |
| `font-size` | `--w-font-size` | `16px` |
| `accent-bg` | `--w-accent-bg` | `linear-gradient(...)` |
| `max-width` | (напрямую) | `600px` |

Пример использования:
```html
<medical-calculator
  primary-color="#e11d48"
  primary-dark="#be123c"
  bg-color="#fff7f7"
  border-radius="12px"
  max-width="500px"
  policy-url="/privacy"
  agreement-url="/terms"
></medical-calculator>
```

### 4. Улучшенная мобильная адаптивность
- `@media (max-width: 640px)`: padding уменьшен, шрифты адаптированы
- `@media (max-width: 400px)`: дополнительное уменьшение для очень маленьких экранов
- `:host` на мобильных получает `max-width: 100%`

### 5. `.env.local.example`
Создан шаблон с инструкциями по настройке всех интеграций.

---
*Сложность: High*
*Статус: Завершено*
