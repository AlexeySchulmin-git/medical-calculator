---
title: "Виджет: синхронизация расчёта цены с тарифами из БД"
date: "2026-02-19"
author: "Cascade"
tags: ["widget", "pricing", "sync", "api"]
status: "completed"
related: ["015-admin-pricing-v2.md", "016-admin-pricing-v3.md"]
files_modified:
  - "medical-api-server.cjs"
  - "public/widget-calculator.js"
---

## Что сделано

### GET /api/pricing/public (без API-ключа)
Новый публичный endpoint для виджета. Отдаёт:
- per_km, base_fixed_add, base_coeff
- waiting_30min, oxygen_fee, no_escort_fee
- round_trip_type, round_trip_value
- floor_tiers: { descent: [...], ascent: [...] }
- city_rates: [...]
- company: { base_address, base_coords }

### widget-calculator.js
- `this.pricing` — объект с дефолтными тарифами (фаллбэк если API недоступен)
- `loadPricing()` — async метод, вызывается в `connectedCallback`, загружает тарифы из `/api/pricing/public`
- `getFloorPrice(direction, weight)` — ищет тариф в `this.pricing.floor_tiers` по весу
- `calculatePrice(distance)` — полностью переписан, использует `this.pricing`:
  - Городские коэффициенты (фикс. цена / % наценка / надбавка за км)
  - Тарифы этажей по весу из БД
  - Кислород, сопровождение
  - Фикс. надбавка и коэфф. %
  - Туда-обратно (коэфф% или фикс. сумма)

### Исправлено: дубликаты в pricing_city_rates
- Добавлена миграция в initializeDatabase: удаление дублей + UNIQUE KEY на city_name
- Было 8 записей (4 Москва + 4 Раменское), стало 2

---
*Сложность: Medium*
*Статус: Завершено*
