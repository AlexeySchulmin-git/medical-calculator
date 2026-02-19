---
title: "Цены из БД — таблица pricing_settings"
date: "2026-02-18"
author: "Cascade"
tags: ["pricing", "mysql", "database", "api"]
status: "completed"
related: ["010-widget-v2-complete.md"]
files_created: []
files_modified:
  - "medical-api-server.cjs"
---

## Что сделано

### Таблица pricing_settings
Создаётся автоматически при старте сервера (`CREATE TABLE IF NOT EXISTS`):
- `key` — название параметра (PRIMARY KEY)
- `value` — числовое значение (DECIMAL 10,2)
- `label` — человекочитаемое название для UI
- `updated_at` — время последнего изменения

### Дефолтные значения (INSERT IGNORE)
| key | value | label |
|-----|-------|-------|
| base | 1500 | Базовая стоимость (₽) |
| per_km | 45 | Стоимость за км (₽) |
| floor_fee | 150 | Доплата за этаж без лифта (₽) |
| overweight_limit | 100 | Лимит веса без доплаты (кг) |
| overweight_fee | 500 | Доплата за превышение веса (₽) |
| escort_fee | 1000 | Стоимость мед. сопровождения (₽) |

### Кэш в памяти (pricingCache)
- Загружается при старте через `loadPricingSettings()`
- Используется во всех расчётах без обращения к БД на каждый запрос
- Обновляется при `PUT /api/pricing`

### Хардкод убран из 3 мест
1. Mock-ответ `/api/widget/config` (когда БД недоступна)
2. `defaultSettings` в `/api/widget/config`
3. `priceData.settings` в `/api/orders`

### Новые endpoints
- `GET /api/pricing` — текущие цены из БД + кэш
- `PUT /api/pricing` — обновление цен (требует x-api-key), обновляет БД и кэш

## Следующий шаг
Admin Dashboard — UI для управления ценами и заявками.

---
*Сложность: Low*
*Статус: Завершено*
