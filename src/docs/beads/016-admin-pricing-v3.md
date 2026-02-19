---
title: "Admin Pricing v3 — надбавки, коэфф%, туда-обратно"
date: "2026-02-18"
author: "Cascade"
tags: ["admin", "pricing", "round-trip", "coefficient"]
status: "completed"
related: ["015-admin-pricing-v2.md"]
files_modified:
  - "medical-api-server.cjs"
  - "public/admin.html"
---

## Что сделано

### Новые поля в pricing_settings
- `base_fixed_add` — фикс. надбавка ± к итоговой стоимости (после всех опций)
- `base_coeff` — коэффициент % к итогу (0 = выключено, может быть отрицательным)
- `round_trip_type` — тип надбавки туда-обратно: 0=коэфф%, 1=фикс. сумма
- `round_trip_value` — значение (80 = +80% по умолчанию, может быть отрицательным = скидка)

### Обновлён calculatePrice
Порядок применения:
1. Стоимость по км (с городскими коэффициентами)
2. Спуск/подъём без лифта
3. Ожидание, кислород, без сопровождения
4. `base_fixed_add` (± фикс.)
5. `base_coeff` (% к итогу)
6. Туда-обратно (коэфф% или фикс. сумма)

### PUT /api/pricing — расширен allowed
Добавлены: base_fixed_add, base_coeff, round_trip_type, round_trip_value.
Отрицательные значения разрешены для: base_fixed_add, base_coeff, round_trip_value.

### Admin UI — новые секции
- В "Базовые тарифы": блок "Надбавка к итоговой стоимости" (фикс. ± и коэфф. %)
- Новая секция "Туда-обратно": выбор типа (коэфф%/фикс. ₽) + значение с динамической подсказкой

---
*Сложность: Medium*
*Статус: Завершено*
