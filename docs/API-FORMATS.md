# Форматы внешних API

## 📋 Обзор

Документация форматов ответов всех внешних API, используемых в Medical Calculator. **Внимательно читайте перед изменением логики работы с API!**

---

## 🏢 DaData Suggest API

### Эндпоинт: `POST /api/dadata/suggest`

### Формат запроса:
```json
{
  "query": "Москва, Тверская",
  "count": 5,
  "locations": [
    {
      "city_fias_id": "0c5b2444-70a0-4932-980c-b4dc0d3f02b5"
    }
  ],
  "from_bound": { "value": "city" },
  "to_bound": { "value": "settlement" }
}
```

### Формат ответа:
```json
{
  "suggestions": [{
    "value": "г Москва, ул Тверская",
    "unrestricted_value": "г Москва, ул Тверская, д 1",
    "data": {
      "fias_level": "7",  // ⚠️ ВАЖНО: СТРОКА с числом!
      "city": "Москва",
      "street": "Тверская",
      "house": "1",
      "city_fias_id": "0c5b2444-70a0-4932-980c-b4dc0d3f02b5",
      "street_fias_id": "1c5b2444-70a0-4932-980c-b4dc0d3f02b5",
      "settlement_fias_id": null,
      "geo_lat": "55.755831",
      "geo_lon": "37.617673"
    }
  }]
}
```

### ⚠️ Критически важные поля:

#### `fias_level` — строка с числом!
```javascript
// ❌ НЕПРАВИЛЬНО:
if (suggestion.data.fias_level === 7) // number

// ✅ ПРАВИЛЬНО:
if (suggestion.data.fias_level === '7') // string
```

#### Значения `fias_level`:
- `'0'`, `'1'`, `'2'` — регион/район
- `'3'`, `'4'` — **город**
- `'5'`, `'6'` — **населённый пункт**
- `'7'` — **улица**
- `'8'` — **дом**
- `'65'` — территория

### Примеры использования:

#### Поиск города:
```javascript
const query = "Ногинск";
const response = await fetch('/api/dadata/suggest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query,
    from_bound: { value: "city" },
    to_bound: { value: "settlement" }
  })
});
```

#### Поиск улицы в городе:
```javascript
const response = await fetch('/api/dadata/suggest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "Ленина",
    locations: [{
      city_fias_id: "0c5b2444-70a0-4932-980c-b4dc0d3f02b5"
    }],
    from_bound: { value: "street" },
    to_bound: { value: "street" }
  })
});
```

#### Поиск дома на улице:
```javascript
const response = await fetch('/api/dadata/suggest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "1",
    locations: [{
      street_fias_id: "1c5b2444-70a0-4932-980c-b4dc0d3f02b5"
    }],
    from_bound: { value: "house" },
    to_bound: { value: "house" }
  })
});
```

---

## 🧹 DaData Clean API

### Эндпоинт: `POST /api/dadata/clean`

### Формат запроса:
```json
{
  "address": "мск, тверская 1"
}
```

### Формат ответа:
```json
{
  "result": "г Москва, ул Тверская, д 1",
  "source": "мск, тверская 1",
  "quality": "GOOD",
  "data": {
    "fias_level": "8",
    "city": "Москва",
    "street": "Тверская",
    "house": "1",
    "geo_lat": "55.755831",
    "geo_lon": "37.617673"
  }
}
```

### ⚠️ Важные моменты:
- `result` — исправленный и стандартизированный адрес
- `quality` — качество исправления: `GOOD`, `BAD`, `UNKNOWN`
- Используйте для автоисправления опечаток (если потребуется)

---

## 🗺️ GraphHopper API

### Эндпоинт: внутренний, используется в `/api/dadata/distance`

### Формат запроса:
```javascript
{
  points: [
    [lat1, lon1], // База
    [lat2, lon2], // Откуда
    [lat3, lon3], // Куда  
    [lat4, lon4]  // База
  ]
}
```

### Формат ответа:
```json
{
  "paths": [{
    "distance": 15420.5,  // метры
    "time": 1200,         // секунды
    "points": "encoded_polyline_string"
  }],
  "provider": "graphhopper"
}
```

---

## 🚗 OSRM API

### Эндпоинт: внутренний, fallback для `/api/dadata/distance`

### Формат запроса:
```javascript
{
  coordinates: [
    [lon1, lat1], // Обратите внимание: lon, lat!
    [lon2, lat2],
    [lon3, lat3],
    [lon4, lat4]
  ]
}
```

### Формат ответа:
```json
{
  "routes": [{
    "distance": 15420.5,  // метры
    "duration": 1200,    // секунды
    "geometry": "encoded_polyline_string"
  }],
  "provider": "osrm"
}
```

---

## 📏 Haversine (расстояние по прямой)

### Используется как финальный fallback

### Формат:
```javascript
function haversine(lat1, lon1, lat2, lon2) {
  // Возвращает расстояние в метрах
}
```

---

## 🔄 Последовательность расчёта расстояния

В `/api/dadata/distance`:

1. **GraphHopper** (приоритет 1)
2. **OSRM** (fallback 2)  
3. **Haversine** (fallback 3)

### Формат финального ответа:
```json
{
  "distance": 15.42,        // км
  "distance_display": "15.4 км",
  "duration": 1200,         // секунды
  "provider": "graphhopper",
  "route": "base→from→to→base"
}
```

---

## 🚨 Частые ошибки

### 1. `fias_level` как число
```javascript
// ❌ ОШИБКА:
if (suggestion.data.fias_level === 7) { // undefined

// ✅ ПРАВИЛЬНО:
if (suggestion.data.fias_level === '7') { // работает
```

### 2. Координаты в разном порядке
```javascript
// GraphHopper: [lat, lon]
// OSRM: [lon, lat] ⚠️
```

### 3. Необработанные null значения
```javascript
// ❌ Может вызвать ошибку:
const city = suggestion.data.city.toLowerCase();

// ✅ Безопасно:
const city = (suggestion.data.city || '').toLowerCase();
```

---

## 📝 Чеклист перед изменением логики API

1. ✅ Прочитать этот файл полностью
2. ✅ Проверить `fias_level` — всегда строка!
3. ✅ Проверить порядок координат для разных провайдеров
4. ✅ Обработать null/undefined значения
5. ✅ Протестировать все сценарии:
   - Выбор города (fias_level 3-6)
   - Выбор улицы (fias_level 7)
   - Выбор дома (fias_level 8)
6. ✅ Проверить логи консоли на ошибки

---

**Дата создания:** 2026-02-21  
**Обновлено:** 2026-02-21  
**Версия:** 1.0
