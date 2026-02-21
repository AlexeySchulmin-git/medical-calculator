---
title: "Миграция MySQL → PostgreSQL (Supabase) + деплой Render"
date: "2026-02-20"
author: "Cascade"
tags: ["postgresql", "supabase", "migration", "render", "google-sheets", "deployment"]
status: "completed"
related: ["020-telegram-webhook-sheets-per-client.md"]
files_created: ["railway.json"]
files_modified: ["medical-api-server.cjs", "package.json", ".env.local.example", "public/admin.html"]
---

## Что сделано:

### 1. Замена mysql2 → pg (node-postgres)
- Все ~40 запросов переведены с `pool.execute` → `pool.query`
- Параметры `?` → `$1..$N`
- `INSERT IGNORE` → `ON CONFLICT DO NOTHING`
- `ON DUPLICATE KEY UPDATE` → `ON CONFLICT DO UPDATE SET`
- `AUTO_INCREMENT` → `SERIAL`
- `TINYINT(1)` → `BOOLEAN`
- `ENUM` → `VARCHAR + CHECK`
- `RETURNING id` для INSERT вместо `insertId`

### 2. Google Sheets: keyFile → env credentials
- Новая переменная `GOOGLE_SERVICE_ACCOUNT_JSON` — содержимое JSON одной строкой
- Обратная совместимость: если `GOOGLE_SERVICE_ACCOUNT_JSON` не задан, используется `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`

### 3. PORT из env
- `const PORT = process.env.PORT || 3003`

### 4. admin.html: динамический URL
- `const API = window.API_URL || (hostname === 'localhost' ? 'http://localhost:3003' : window.location.origin)`

### 5. Supabase подключение
- Используется Pooler URL (порт 6543) вместо прямого (5432)
- SSL автоматически включается для не-localhost хостов

### 6. GitHub + Render
- Инициализирован git репозиторий
- Первый коммит запушен в `AlexeySchulmin-git/medical-calculator`
- Создан `railway.json` с командой запуска `node medical-api-server.cjs`

### 7. Яндекс Router API
- Ключ `9ba3dbb6-7e67-4008-93b7-532196c9a59f` работает только для Geocoder
- Router API требует отдельного ключа
- Оставлен текущий порядок: GraphHopper → OSRM → Haversine

## Влияние:
- Приложение готово к деплою на Render (бесплатно, навсегда)
- База данных в Supabase (PostgreSQL, бесплатный tier)
- Локальная разработка продолжает работать через `.env.local`

---
*Сложность: High*
*Статус: Завершено*
