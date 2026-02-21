# Roadmap Medical Calculator

## 🎯 МЕЛКИЕ ПРАВКИ (Quick Wins)

### 1. ✅ Фиксированный блок цены (приоритет: HIGH) — ВЫПОЛНЕНО
**Задача:** Блок с ценой всегда в поле видимости, адаптивно для мобильных

**Реализовано:**
- Desktop: блок цены в обычном потоке (убрано sticky по требованию)
- Mobile: фиксированная нижняя панель с ценой
- Сохранение и восстановление цены после перезагрузки

**Файлы:** `public/widget-calculator.js` (CSS + localStorage)

---

### 2. ❌ Автоисправление адресов (приоритет: MEDIUM) — ОТМЕНЕНО
**Задача:** Исправление опечаток и неправильной раскладки в адресах

**Статус:** Отменено из-за проблем с UX (blur handler вызывал ошибки)
**Причина:** Пользователи жаловались на автоматическое исправление при потере фокуса

**Альтернатива:** Можно реализовать по кнопке "Исправить адрес" вручную

**Трудоёмкость:** 3-4 часа (если потребуется)
**Файлы:** `public/widget-calculator.js`

---

### 3. ✅ Подсказка в поле Email (приоритет: LOW) — ВЫПОЛНЕНО
**Задача:** Placeholder "Введите для получения деталей заказа"

**Реализовано:** Placeholder обновлён

**Трудоёмкость:** 5 минут  
**Файлы:** `public/widget-calculator.js`

---

### 4. Отправка деталей заявки клиенту (приоритет: MEDIUM)
**Задача:** При вводе телефона отправлять детали в Telegram/SMS

**Варианты:**

#### Telegram (рекомендуется)
- **Логика:** При вводе телефона → поиск клиента в БД → если есть `telegram_chat_id` → отправка
- **Плюсы:** Бесплатно, богатое форматирование
- **Минусы:** Требует предварительной регистрации клиента в боте

**Реализация:**
1. Добавить эндпоинт `POST /api/send-order-details` (принимает phone + order_id)
2. При успешной отправке заявки → автоматически вызывать этот эндпоинт
3. Сервер ищет `telegram_chat_id` по телефону и отправляет детали

#### SMS через провайдера (альтернатива)
- **Провайдеры:** SMSC.ru, SMS.ru, Twilio
- **Стоимость:** ~3-5₽ за SMS
- **Плюсы:** Не требует регистрации клиента
- **Минусы:** Платно, ограничение по длине (160 символов)

**Рекомендация:** Telegram (бесплатно + удобнее)

**Трудоёмкость:** 4-6 часов  
**Файлы:** 
- `medical-api-server.cjs` (новый эндпоинт + функция sendOrderDetailsToClient)
- `public/widget-calculator.js` (вызов после submitOrder)

---

## 🛡️ КАЧЕСТВО КОДА И ПРЕДОТВРАЩЕНИЕ ОШИБОК (приоритет: HIGH)

### 1. Документация форматов внешних API (приоритет: CRITICAL)
**Задача:** Создать документацию форматов ответов всех внешних API

**Проблема:** Отсутствие документации привело к ошибке с `fias_level` (ожидали текст 'city', получили число '3')

**Решение:**
```markdown
# docs/API-FORMATS.md

## DaData Suggest API

### Формат ответа:
```json
{
  "suggestions": [{
    "value": "г Москва, ул Ленина",
    "data": {
      "fias_level": "7",  // ⚠️ СТРОКА с числом!
      // 0-2: регион/район
      // 3-4: город  
      // 5-6: населённый пункт
      // 7: улица
      // 8: дом
      "city": "Москва",
      "street": "Ленина",
      "city_fias_id": "xxx",
      "street_fias_id": "yyy"
    }
  }]
}
```

### Примеры использования:
- Поиск города: `from_bound: city, to_bound: settlement`
- Поиск улицы: `locations: [{city_fias_id: "xxx"}], from_bound: street`
- Поиск дома: `locations: [{street_fias_id: "yyy"}], from_bound: house`
```

**Трудоёмкость:** 4-6 часов  
**Файлы:** `docs/API-FORMATS.md` (новый файл)

---

### 2. TypeScript типы для внешних API (приоритет: HIGH)
**Задача:** Добавить строгую типизацию для предотвращения ошибок типов

**Решение:**
```typescript
// src/types/dadata.d.ts
export interface DaDataSuggestion {
  value: string;
  unrestricted_value: string;
  data: {
    fias_level: '0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'65';
    city: string | null;
    settlement: string | null;
    street: string | null;
    house: string | null;
    city_fias_id: string | null;
    settlement_fias_id: string | null;
    street_fias_id: string | null;
    geo_lat: string | null;
    geo_lon: string | null;
  };
}

export type FiasLevel = 
  | '0' | '1' | '2'  // регион/район
  | '3' | '4'        // город
  | '5' | '6'        // населённый пункт
  | '7'              // улица
  | '8'              // дом
  | '65';            // территория
```

**Трудоёмкость:** 3-4 часа  
**Файлы:** `src/types/dadata.d.ts`, `src/types/graphhopper.d.ts`, `src/types/osrm.d.ts`

---

### 3. Unit-тесты для критической логики (приоритет: HIGH)
**Задача:** Покрыть тестами каскадный ввод адреса и расчёт цены

**Решение:**
```javascript
// tests/widget/address-suggestions.test.js
describe('Address Suggestions', () => {
  test('should handle city selection (fias_level 3-6)', () => {
    const suggestion = {
      dataset: {
        fiasLevel: '3',
        city: 'Ногинск',
        cityFias: 'xxx-xxx'
      }
    };
    
    const result = handleSuggestionClick(suggestion);
    expect(result.inputValue).toBe('Ногинск, ');
    expect(result.placeholder).toBe('Введите улицу');
    expect(result.addressState.cityName).toBe('Ногинск');
  });

  test('should handle street selection (fias_level 7)', () => {
    // ...
  });

  test('should handle house selection (fias_level 8)', () => {
    // ...
  });
});

// tests/server/calculate-price.test.js
describe('Price Calculation', () => {
  test('should calculate base price correctly', () => {
    // ...
  });
  
  test('should apply city rate multiplier', () => {
    // ...
  });
});
```

**Трудоёмкость:** 8-12 часов  
**Файлы:** `tests/widget/`, `tests/server/`, `package.json` (добавить Jest)

---

### 4. E2E тесты для критических флоу (приоритет: MEDIUM)
**Задача:** Автоматизированное тестирование полного пути пользователя

**Решение:**
```javascript
// tests/e2e/order-flow.spec.js (Playwright)
test('should complete full order flow', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Ввод адреса "откуда"
  await page.fill('#fromAddress', 'ног');
  await page.click('text=Московская обл, г Ногинск');
  await page.fill('#fromAddress', 'лен');
  await page.click('text=ул Ленина');
  
  // Проверка отображения
  await expect(page.locator('#fromAddress')).toHaveValue(/Ногинск.*Ленина/);
  
  // Заполнение остальных полей
  await page.fill('#toAddress', 'Москва, Красная площадь, 1');
  await page.fill('#weight', '80');
  await page.fill('#phone', '+79991234567');
  
  // Отправка заявки
  await page.click('#submitBtn');
  
  // Проверка успеха
  await expect(page.locator('.success-message')).toBeVisible();
});
```

**Трудоёмкость:** 6-8 часов  
**Файлы:** `tests/e2e/`, `playwright.config.js`

---

### 5. Workflow чеклисты для критических изменений (приоритет: MEDIUM)
**Задача:** Создать чеклисты для предотвращения ошибок при изменениях

**Решение:**
```markdown
# .windsurf/workflows/address-changes.md
---
description: Чеклист изменений логики адресов
---

## Перед изменением логики адресов:

1. ✅ Прочитать документацию DaData: https://dadata.ru/api/suggest/address/
2. ✅ Проверить docs/API-FORMATS.md для формата ответа
3. ✅ Проверить docs/CODEINDEX.md раздел "Внешние интеграции"
4. ✅ Запустить существующие тесты: `npm test`
5. ✅ Проверить TypeScript типы (если используются)

## После изменения:

1. ✅ Протестировать все сценарии:
   - Выбор города (fias_level 3-6)
   - Выбор улицы (fias_level 7)
   - Выбор дома (fias_level 8)
   - Отображение в поле
   - Сохранение в dataset.fullAddress
2. ✅ Проверить логи в консоли браузера
3. ✅ Проверить отправку в админку
4. ✅ Запустить тесты: `npm test`
5. ✅ Обновить документацию (если изменился формат)
```

**Трудоёмкость:** 2-3 часа  
**Файлы:** `.windsurf/workflows/address-changes.md`, `.windsurf/workflows/price-calculation-changes.md`

---

### 6. Удаление legacy кода (приоритет: MEDIUM)
**Задача:** Удалить дублирование и устаревший код

**Из CODEINDEX.md:**
```
⚠️ Известные несоответствия:
1. Два расчёта расстояния (Next.js route vs Express)
2. Два calculatePrice (src/lib/calculator.js vs medical-api-server.cjs)
3. src/widget/api.js::calculateDistance() устарел
```

**Решение:**
1. Удалить `src/lib/calculator.js` или пометить `@deprecated`
2. Удалить Next.js routes для distance/orders
3. Обновить CODEINDEX.md с явным указанием "НЕ ИСПОЛЬЗОВАТЬ"
4. Добавить ESLint правило для запрета импорта deprecated модулей

**Трудоёмкость:** 4-6 часов  
**Файлы:** `src/lib/calculator.js`, `src/app/api/dadata/distance/`, `docs/CODEINDEX.md`

---

### 7. Storybook для визуального тестирования (приоритет: LOW)
**Задача:** Визуальное тестирование компонентов виджета

**Решение:**
```javascript
// stories/AddressSuggestions.stories.js
export default {
  title: 'Widget/AddressSuggestions',
  component: AddressSuggestions,
};

export const Default = () => ({
  suggestions: [
    { value: 'г Москва', data: { fias_level: '3', city: 'Москва' } },
    { value: 'г Санкт-Петербург', data: { fias_level: '3', city: 'Санкт-Петербург' } },
  ]
});

export const WithStreets = () => ({
  suggestions: [
    { value: 'ул Ленина', data: { fias_level: '7', street: 'Ленина' } },
    { value: 'ул Пушкина', data: { fias_level: '7', street: 'Пушкина' } },
  ]
});
```

**Трудоёмкость:** 6-8 часов  
**Файлы:** `.storybook/`, `stories/`

---

### 8. Мониторинг ошибок в production (приоритет: MEDIUM)
**Задача:** Отслеживание ошибок в реальном времени

**Решение:**
```javascript
// Интеграция Sentry
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "https://xxx@sentry.io/xxx",
  environment: process.env.NODE_ENV,
  beforeSend(event, hint) {
    // Фильтрация ошибок
    if (event.exception) {
      console.error(hint.originalException);
    }
    return event;
  },
});

// Автоматическое логирование ошибок API
fetch('/api/orders', { ... })
  .catch(error => {
    Sentry.captureException(error);
    throw error;
  });
```

**Трудоёмкость:** 3-4 часа  
**Файлы:** `src/widget/index.jsx`, `medical-api-server.cjs`

---

## 🏗️ ГЛОБАЛЬНЫЕ ЗАДАЧИ

### 1. Суперадмин панель (приоритет: MEDIUM)
**Задача:** Управление клиентами, лицензиями, доменами

**Архитектура:**

#### База данных (новые таблицы)
```sql
-- Расширение таблицы clients
ALTER TABLE clients ADD COLUMN license_type VARCHAR(20) DEFAULT 'trial'; -- trial|paid|blocked
ALTER TABLE clients ADD COLUMN trial_until TIMESTAMP;
ALTER TABLE clients ADD COLUMN paid_until TIMESTAMP;
ALTER TABLE clients ADD COLUMN allowed_domains TEXT[]; -- ['example.com', 'www.example.com']
ALTER TABLE clients ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE clients ADD COLUMN company_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN contact_email VARCHAR(255);

-- Таблица супер-админов
CREATE TABLE super_admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Функционал
1. **Управление клиентами:**
   - CRUD операции (создание, редактирование, удаление)
   - Генерация API ключей (crypto.randomBytes(32).toString('hex'))
   - Просмотр статистики: заказов, выручки, активности

2. **Лицензии:**
   - Trial: 14 дней, автоматическая блокировка после окончания
   - Paid: продление на N месяцев
   - Blocked: ручная блокировка

3. **Доменная идентификация:**
   - Виджет отправляет `Origin` заголовок
   - Middleware проверяет `allowed_domains` для API ключа
   - Блокировка запросов с неразрешённых доменов

4. **Email-напоминания:**
   - Cron job (node-cron): проверка раз в день
   - За 3 дня до окончания trial → email
   - За 7 дней до окончания paid → email
   - При блокировке → email

#### UI (новая страница)
- `/superadmin` — отдельная страница с авторизацией
- Таблица клиентов с фильтрами (trial/paid/blocked)
- Модальное окно создания/редактирования клиента
- Dashboard: статистика по всем клиентам

**Трудоёмкость:** 20-30 часов  
**Файлы:**
- `medical-api-server.cjs` (новые эндпоинты, middleware, cron)
- `public/superadmin.html` + `public/superadmin.css` (новая админка)
- Миграция БД

---

### 2. Автоподстройка стилей виджета (приоритет: LOW)
**Задача:** CSS переменные через HTML атрибуты

**Реализация:**
```html
<medical-calculator
  data-key="..."
  data-primary-color="#3b82f6"
  data-font-family="Inter, sans-serif"
  data-border-radius="12px"
  data-bg-color="#ffffff"
></medical-calculator>
```

```javascript
// В src/widget/index.jsx
connectedCallback() {
  const primaryColor = this.getAttribute('data-primary-color') || '#3b82f6';
  const fontFamily = this.getAttribute('data-font-family') || 'inherit';
  // ...
  this.shadowRoot.host.style.setProperty('--primary-color', primaryColor);
  this.shadowRoot.host.style.setProperty('--font-family', fontFamily);
}
```

**Трудоёмкость:** 3-4 часа  
**Файлы:** `src/widget/index.jsx`, `src/widget/styles.css`

---

### 2.1. Отключение/включение полей калькулятора (приоритет: MEDIUM)
**Задача:** Настройка видимости полей через админку

**Архитектура:**

#### База данных
```sql
ALTER TABLE clients ADD COLUMN widget_config JSONB DEFAULT '{}';
-- Пример: {"fields": {"email": false, "comment": false, "escort": true}}
```

#### API
- `GET /api/widget/config?api_key=XXX` → возвращает `widget_config`
- `PUT /api/clients/:id/widget-config` → обновление конфига (из админки)

#### Виджет
```javascript
// В Calculator.jsx
async loadConfig() {
  const config = await api.getConfig();
  this.fieldsConfig = config.fields || {};
}

render() {
  return html`
    ${this.fieldsConfig.email !== false ? html`<input id="email" />` : ''}
    ${this.fieldsConfig.comment !== false ? html`<textarea id="comment" />` : ''}
  `;
}
```

**Трудоёмкость:** 8-10 часов  
**Файлы:**
- `medical-api-server.cjs` (новый эндпоинт)
- `public/admin.html` (новая секция настроек виджета)
- `src/widget/Calculator.jsx` (условный рендеринг)

---

### 3. Демо админ и виджет (приоритет: MEDIUM)
**Задача:** Публичная демо-версия для потенциальных клиентов

**Решение:**
1. **Демо-виджет:** `/demo.html` — встроенный виджет с тестовым API ключом
2. **Демо-админка:** `/demo-admin.html` — read-only версия с фейковыми данными
3. **Seed данные:** Автоматическое создание демо-заказов при старте сервера

**Трудоёмкость:** 6-8 часов  
**Файлы:**
- `public/demo.html`, `public/demo-admin.html`
- `medical-api-server.cjs` (seed функция для демо-данных)

---

### 4. Визуальная навигация админки (приоритет: LOW)
**Задача:** Интерактивные подсказки (onboarding tour)

**Библиотеки:**
- **Intro.js** — пошаговые туры с подсветкой элементов
- **Shepherd.js** — более гибкая альтернатива
- **Driver.js** — легковесная библиотека

**Реализация:**
```javascript
// В admin.html
import introJs from 'intro.js';

function startTour() {
  introJs().setOptions({
    steps: [
      { element: '#nav-orders', intro: 'Здесь вы видите все заявки' },
      { element: '#nav-pricing', intro: 'Настройте тарифы здесь' },
      // ...
    ]
  }).start();
}

// Показывать при первом входе
if (!localStorage.getItem('tourCompleted')) {
  startTour();
  localStorage.setItem('tourCompleted', 'true');
}
```

**Трудоёмкость:** 4-6 часов  
**Файлы:** `public/admin.html` (интеграция библиотеки + конфигурация туров)

---

### 5. Документация (приоритет: MEDIUM)
**Задача:** Техническая и юридическая документация

#### Техническая документация
**Разделы:**
1. **Быстрый старт:**
   - Регистрация → получение API ключа
   - Установка виджета на сайт (код вставки)
   - Настройка тарифов

2. **API Reference:**
   - Все эндпоинты с примерами запросов/ответов
   - Коды ошибок
   - Rate limits

3. **Интеграции:**
   - Telegram бот (как подключить)
   - Google Sheets (как настроить)
   - Email уведомления (SMTP настройки)

4. **Кастомизация:**
   - CSS переменные виджета
   - Настройка полей
   - Webhook для заказов

**Формат:** Markdown → статический сайт (VitePress, Docusaurus)

#### Юридическая документация
**Разделы:**
1. **Пользовательское соглашение** (для клиентов-компаний)
2. **Политика конфиденциальности** (GDPR-совместимая)
3. **Договор оферты** (для платных тарифов)
4. **SLA** (гарантии uptime, поддержки)

**Формат:** PDF + HTML версии

**Трудоёмкость:** 15-20 часов (техническая) + консультация юриста (юридическая)  
**Файлы:** 
- `docs/` (новая папка с markdown файлами)
- Генератор статического сайта (VitePress)

---

## 📋 РЕЗЮМЕ ПО ПРИОРИТЕТАМ

### 🔴 КРИТИЧЕСКИЙ ПРИОРИТЕТ (сделать немедленно)
1. **Документация форматов API** (4-6ч) — предотвращение ошибок типа fias_level
2. **TypeScript типы для API** (3-4ч) — строгая типизация
3. **Unit-тесты для адресов** (8-12ч) — автоматическое обнаружение ошибок

**Итого:** 2-3 рабочих дня

---

### 🔴 ВЫСОКИЙ ПРИОРИТЕТ (следующая неделя)
1. ✅ **Фиксированный блок цены** — ВЫПОЛНЕНО
2. ✅ **Подсказка в Email** — ВЫПОЛНЕНО
3. **Workflow чеклисты** (2-3ч) — процесс разработки
4. **Удаление legacy кода** (4-6ч) — снижение путаницы
5. **Мониторинг ошибок (Sentry)** (3-4ч) — отслеживание проблем

**Итого:** 2 рабочих дня

---

### 🟡 СРЕДНИЙ ПРИОРИТЕТ (следующий спринт)
1. ❌ **Автоисправление адресов** — ОТМЕНЕНО (проблемы с UX)
2. **E2E тесты** (6-8ч) — автоматизация тестирования
3. **Отправка деталей клиенту** (4-6ч) — повышает лояльность
4. **Суперадмин панель** (20-30ч) — критично для масштабирования
5. **Отключение полей виджета** (8-10ч) — гибкость для клиентов
6. **Демо версия** (6-8ч) — маркетинг и продажи
7. **Документация техническая** (15-20ч) — снижает нагрузку на поддержку

**Итого:** 2-3 недели

---

### 🟢 НИЗКИЙ ПРИОРИТЕТ (backlog)
1. **Storybook** (6-8ч) — визуальное тестирование компонентов
2. **Автоподстройка стилей** (3-4ч) — nice to have
3. **Визуальная навигация** (4-6ч) — улучшает onboarding
4. **Юридическая документация** (консультация юриста) — для официального запуска

**Итого:** по мере необходимости

---

## 🎯 РЕКОМЕНДУЕМАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ

### Спринт 0 (КРИТИЧЕСКИЙ — 1 неделя)
1. ✅ Документация форматов API
2. ✅ TypeScript типы для внешних API
3. ✅ Unit-тесты для каскадного ввода адреса
4. ✅ Workflow чеклисты
5. ✅ Удаление legacy кода

**Результат:** Предотвращение ошибок, качественная кодовая база

---

### Спринт 1 (1 неделя)
1. ✅ Фиксированный блок цены — ВЫПОЛНЕНО
2. ✅ Подсказка в Email — ВЫПОЛНЕНО
3. ✅ Каскадный ввод адреса — ВЫПОЛНЕНО
4. ✅ E2E тесты для критических флоу
5. ✅ Мониторинг ошибок (Sentry)
6. ✅ Отправка деталей клиенту

**Результат:** Улучшенный UX виджета, автоматизация тестирования

---

### Спринт 2 (2 недели)
1. ✅ Суперадмин панель (основа)
2. ✅ Отключение полей виджета
3. ✅ Демо версия

**Результат:** Готовность к масштабированию, инструменты продаж

---

### Спринт 3 (1-2 недели)
1. ✅ Техническая документация
2. ✅ Автоподстройка стилей
3. ✅ Визуальная навигация

**Результат:** Полноценный продукт, готовый к продаже

---

### Спринт 4 (по необходимости)
1. ✅ Юридическая документация
2. ✅ Доработки по фидбеку клиентов

**Результат:** Официальный запуск

---

## 💡 ДОПОЛНИТЕЛЬНЫЕ РЕКОМЕНДАЦИИ

### Технический долг
- ✅ Удалить legacy код (`src/lib/calculator.js`, MySQL routes) — ЗАПЛАНИРОВАНО в Спринте 0
- Мигрировать всё на PostgreSQL + Express
- ✅ Добавить TypeScript для критичных модулей — ЗАПЛАНИРОВАНО в Спринте 0
- ✅ Создать документацию форматов API — ЗАПЛАНИРОВАНО в Спринте 0
- ✅ Покрыть тестами критическую логику — ЗАПЛАНИРОВАНО в Спринте 0

### Мониторинг и аналитика
- Логирование ошибок (Sentry)
- Метрики производительности (Prometheus + Grafana)
- Аналитика использования виджета (Amplitude, Mixpanel)

### Безопасность
- Rate limiting для API (express-rate-limit)
- CORS настройка для production
- Валидация всех входных данных (Joi, Zod)
- Регулярные обновления зависимостей

### DevOps
- CI/CD pipeline (GitHub Actions)
- ✅ Автоматическое тестирование (Jest, Playwright) — ЗАПЛАНИРОВАНО в Спринте 0-1
- Staging окружение
- Backup БД (автоматический ежедневный)
- ✅ Мониторинг ошибок (Sentry) — ЗАПЛАНИРОВАНО в Спринте 1

---

**Дата создания:** 2026-02-21  
**Версия:** 1.0
