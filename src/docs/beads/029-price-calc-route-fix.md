---
title: "Исправление расчёта расстояния: маршрут База→Откуда→Куда→База"
date: "2026-02-21"
author: "Cascade"
tags: ["bugfix", "pricing", "distance", "routing", "calculator"]
status: "completed"
related: ["027-price-calc-fixes.md"]
files_modified: ["medical-api-server.cjs", "src/widget/Calculator.jsx"]
files_created: []
---

## Что сделано

Исправлены три критических ошибки в расчёте стоимости перевозки.

---

## ❌ Ошибка 1: Маршрут Откуда→Куда вместо База→Откуда→Куда→База

### Проблема
`/api/dadata/distance` строил маршрут только между двумя точками (Откуда→Куда), игнорируя базу перевозчика.

### Исправление
Эндпоинт теперь строит полный маршрут из 4 точек: **База → Откуда → Куда → База**.
- База берётся из `companyCache.base_coords` (настройки компании в БД)
- GraphHopper: один запрос с 4 точками (`?point=...&point=...&point=...&point=...`)
- OSRM/Haversine: три сегмента суммируются

```javascript
// Было: from → to
const ghUrl = `...?point=${from.lat},${from.lon}&point=${to.lat},${to.lon}...`

// Стало: база → from → to → база
const ghUrl = `...?point=${base.lat},${base.lon}&point=${from.lat},${from.lon}&point=${to.lat},${to.lon}&point=${base.lat},${base.lon}...`
```

---

## ❌ Ошибка 2: Виджет передавал плоские поля, сервер ожидал объекты

### Проблема
Виджет отправлял `from_lat, from_lon, to_lat, to_lon` (плоские поля), а сервер читал `req.body.from` и `req.body.to` как объекты `{lat, lon}`. Результат: `from = undefined`, расстояние не считалось.

### Исправление
Сервер теперь поддерживает оба формата:
```javascript
// Плоские поля от виджета
if (!from && req.body.from_lat && req.body.from_lon) {
  from = { lat: parseFloat(req.body.from_lat), lon: parseFloat(req.body.from_lon) };
}
```
Виджет обновлён — теперь передаёт объекты `{lat, lon}`:
```javascript
body: JSON.stringify({
  from: { lat: parseFloat(fromLat), lon: parseFloat(fromLon) },
  to:   { lat: parseFloat(toLat),   lon: parseFloat(toLon)   }
})
```

---

## ❌ Ошибка 3: Виджет считал цену локально, игнорируя тарифы из БД

### Проблема
`Calculator.jsx:calculatePrice()` использовала `settings.pricing.base/per_km` из конфига виджета. Городские коэффициенты (Москва +30%), фиксированные цены (Раменское 4500₽) и тарифы этажей из БД **не применялись**.

### Исправление
Добавлен новый эндпоинт **`POST /api/calculate-price`** в сервере. Виджет теперь вызывает его вместо локального расчёта:

```javascript
// Было: локальный расчёт
let calculatedPrice = settings.pricing.base;
calculatedPrice += dist * settings.pricing.per_km;
// ...

// Стало: запрос к серверу
const response = await api.fetch('/api/calculate-price', {
  method: 'POST',
  body: JSON.stringify({
    total_distance: dist,
    from_city: fromAddr,
    to_city: toAddr,
    weight, descent_floors, ascent_floors,
    waiting_slots, need_oxygen, no_escort, round_trip
  })
});
setPrice(response.price);
```

Сервер применяет полную логику `calculatePrice()` с:
- Городскими коэффициентами (Москва +30%)
- Фиксированными ценами (Раменское 4500₽ если оба адреса в городе)
- Тарифами этажей по весу
- Надбавками за ожидание, кислород, без сопровождения
- Туда-обратно (% или фикс)

---

## Влияние

- **Расстояние** теперь корректное: включает путь от базы и обратно
- **Цена** теперь корректная: применяются все тарифы из БД
- **Москва**: наценка +30% применяется через сервер
- **Раменское**: фиксированная цена 4500₽ применяется если оба адреса в городе
- **Новый эндпоинт** `/api/calculate-price` для предварительного расчёта без создания заказа

---
*Сложность: High*
*Статус: Завершено*
