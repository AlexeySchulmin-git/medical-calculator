---
title: "Система лояльности: бонусы, процент начисления, вкл/выкл"
date: "2026-02-20"
author: "Cascade"
tags: ["loyalty", "bonus", "customers", "admin", "backend"]
status: "completed"
related: ["023-admin-redesign-light-theme.md"]
files_created: []
files_modified: ["medical-api-server.cjs", "public/admin.html"]
---

## Что сделано:

### База данных
- Таблица `customers` (phone UNIQUE, bonus_balance, total_orders, total_spent)
- Настройки в `pricing_settings`: `loyalty_enabled` (0/1), `loyalty_percent` (%)
- Миграция `orders`: добавлены колонки bonus_earned, bonus_used, escort_count, floor_descent, floor_ascent, need_oxygen, order_number

### Backend (medical-api-server.cjs)
- `GET /api/loyalty/balance?phone=` — публичный, баланс по телефону
- `GET /api/loyalty/customers` — список клиентов для админки
- `POST /api/loyalty/adjust` — ручная корректировка баланса
- `GET /api/loyalty/settings` — получить настройки
- `PUT /api/loyalty/settings` — сохранить настройки
- При создании заказа (`POST /api/orders`): автоначисление бонусов если `loyalty_enabled=1`
- Логика: `bonus_earned = round(price * loyalty_percent / 100)`
- UPSERT в `customers`: создаёт запись или обновляет баланс/статистику

### Админка (admin.html)
- Новый пункт навигации «Лояльность» (иконка звезда)
- Страница с настройками: вкл/выкл + процент начисления
- Статистика: всего клиентов, баллов выдано, оборот
- Таблица клиентов: телефон, баланс, заказов, сумма, ручная коррекция баланса

## Влияние:
- Клиенты автоматически получают бонусы при включённой системе
- Менеджер может корректировать баланс вручную (+/-)
- Следующий шаг: показывать баланс бонусов в виджете по номеру телефона

---
*Сложность: Medium*
*Статус: Завершено*
