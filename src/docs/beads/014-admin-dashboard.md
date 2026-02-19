---
title: "Admin Dashboard — управление заявками и ценами"
date: "2026-02-18"
author: "Cascade"
tags: ["admin", "dashboard", "ui", "orders", "pricing"]
status: "completed"
related: ["013-prices-from-db.md"]
files_created:
  - "public/admin.html"
files_modified:
  - "medical-api-server.cjs"
---

## Что сделано

### public/admin.html
Статичный HTML без зависимостей. Тёмная тема. Доступен по `http://localhost:3000/admin.html`.

**Авторизация:** вход по API ключу — проверяется реальным запросом к `GET /api/orders`.

**Страница "Заявки":**
- 4 stat-карточки: всего / новые / в работе / завершены
- Таблица: номер+дата, телефон+email, маршрут, км, стоимость, статус-бейдж
- Фильтры по статусу (все / новые / в работе / завершены / отменены)
- Пагинация (20 на страницу)
- Клик по строке → модалка с полными деталями
- Смена статуса через select в модалке → PATCH /api/orders/:id

**Страница "Цены":**
- Загружает текущие цены из GET /api/pricing
- 6 input-полей с подписями и единицами
- Кнопка "Сохранить" → PUT /api/pricing → обновляет БД и кэш сервера

### Новые endpoints в medical-api-server.cjs
- `GET /api/orders` — список с пагинацией (?page, ?limit, ?status), требует x-api-key
- `PATCH /api/orders/:id` — смена статуса (new/in_progress/completed/cancelled), требует x-api-key

## Следующий шаг
Telegram-бот — уведомление о новой заявке.

---
*Сложность: Medium*
*Статус: Завершено*
