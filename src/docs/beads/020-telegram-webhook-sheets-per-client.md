---
title: "Telegram webhook + Google Sheets per-client + страница Интеграции в админке"
date: "2026-02-19"
author: "Cascade"
tags: ["telegram", "google-sheets", "admin", "webhook", "per-client"]
status: "completed"
related: ["019-telegram-sheets-widget-styles.md"]
files_modified:
  - "medical-api-server.cjs"
  - "public/admin.html"
---

## Что сделано

### Архитектура: per-client интеграции
Каждый клиент (покупатель продукта) имеет свои настройки интеграций в таблице `clients`:
- `telegram_chat_id` — привязывается автоматически через бота
- `google_spreadsheet_id` — вводится вручную в админке

### Telegram: self-service подключение через /start
**Миграция:** `ALTER TABLE clients ADD COLUMN telegram_chat_id VARCHAR(50)`

**Webhook** `POST /api/telegram/webhook`:
- Пользователь находит бота (ссылка показана в админке)
- Отправляет `/start ВАШ_API_КЛЮЧ`
- Бот ищет клиента по api_key, сохраняет chat_id в БД
- Подтверждает подключение сообщением с именем компании

**Уведомления:** `sendTelegramNotification(order, chatId)` — теперь принимает chatId из клиента, не из env.

### Google Sheets: per-client spreadsheet_id
**Миграция:** `ALTER TABLE clients ADD COLUMN google_spreadsheet_id VARCHAR(200)`

**Инструкция для пользователя:**
1. Создать таблицу
2. Поделиться с email сервисного аккаунта (показывается в админке)
3. Вставить ID таблицы в поле

**Запись:** `appendOrderToSheet(order, spreadsheetId)` — берёт spreadsheetId из клиента.

### Новые API-эндпоинты
- `GET /api/integrations` — настройки клиента + bot_username + sheets_service_email
- `PUT /api/integrations` — сохранение telegram_chat_id / google_spreadsheet_id
- `GET /api/telegram/test-client` — тест Telegram для текущего клиента
- `GET /api/sheets/test-client` — тест Google Sheets для текущего клиента

### Страница "Интеграции" в админке
Новый пункт в сайдбаре. Две секции:

**Telegram:**
- Показывает @username бота (загружается через getMe)
- Показывает команду `/start API_КЛЮЧ` с подставленным ключом
- Статус подключения (✅/⚪)
- Кнопки: "Отправить тест", "Отключить"

**Google Sheets:**
- Показывает email сервисного аккаунта для шаринга
- Поле для ID таблицы
- Кнопки: "Сохранить", "Проверить запись"

---
*Сложность: High*
*Статус: Завершено*
