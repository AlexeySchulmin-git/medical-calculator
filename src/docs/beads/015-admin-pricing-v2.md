---
title: "Admin Dashboard v2 — расширенные настройки цен"
date: "2026-02-18"
author: "Cascade"
tags: ["admin", "pricing", "floor-tiers", "city-rates", "company"]
status: "completed"
related: ["014-admin-dashboard.md"]
files_created: []
files_modified:
  - "medical-api-server.cjs"
  - "public/admin.html"
---

## Что сделано

### Новые таблицы MySQL
- `company_settings` — адрес базы (стартовая точка маршрута) и координаты
- `pricing_floor_tiers` — тарифы спуска/подъёма по весу (direction, weight_from, weight_to, price_per_floor)
- `pricing_city_rates` — городские коэффициенты и фиксированные цены (city_name, rate_type, value, is_fixed_price, note)
- `pricing_settings` обновлена: убраны base/floor_fee/overweight, добавлены waiting_30min, oxygen_fee, no_escort_fee

### Новая логика calculatePrice
Маршрут: База → Откуда → Куда → База (total_distance из виджета).
- Если город назначения имеет `is_fixed_price=1` — цена фиксированная, км не считаются
- Если `rate_type=percent` — наценка % к стоимости по км
- Если `rate_type=flat_km` — надбавка к базовой ставке за км
- Спуск/подъём: тариф по весу из `pricing_floor_tiers`
- Ожидание: слоты по 30 мин × waiting_30min
- Кислород: oxygen_fee
- Без сопровождения: no_escort_fee
- Туда-обратно: ×1.8

### Новые API endpoints
- `GET/PUT /api/company` — адрес и координаты базы
- `GET/PUT /api/pricing/floor-tiers` — тарифы этажей (полная замена массива)
- `GET/POST/PUT/DELETE /api/pricing/city-rates` — CRUD городских ставок

### Admin Dashboard — страница "Цены" (6 секций)
1. **Адрес базы** — текстовый адрес + координаты lat,lon
2. **Базовые тарифы** — за км, ожидание, кислород, без сопровождения
3. **Спуск без лифта** — таблица диапазонов веса → цена за этаж
4. **Подъём без лифта** — аналогично
5. **Города** — список с типом (%, надбавка/км, фикс.), значением, флагом фикс. цены
6. **Мед. сопровождение** — информационный блок (цена по договорённости)

### Бизнес-логика по запросу
- Раменское: фикс. цена 4500₽ (не считается по км)
- Москва: наценка 30% из-за пробок
- Спуск до 90кг=250₽, 91-100кг=350₽, 101+кг=450₽
- Подъём до 90кг=350₽, 91-100кг=450₽, 101+кг=550₽

---
*Сложность: High*
*Статус: Завершено*
