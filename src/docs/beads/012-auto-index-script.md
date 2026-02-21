---
title: "Создание автоматического индексатора кодовой базы"
date: "2026-02-21"
author: "Cascade"
tags: ["automation", "codeindex", "script", "documentation"]
status: "completed"
related: ["011-ai-memory-system.md"]
files_created: ["scripts/update-codeindex-simple.js"]
files_modified: ["package.json", "docs/CODEINDEX.md"]
---

## Что сделано:
Создан автоматический скрипт для обновления CODEINDEX.md с нулевыми зависимостями.

### Создан скрипт:
- **`scripts/update-codeindex-simple.js`** - автоматический индексатор
- **`npm run index`** - команда для запуска

### Функциональность скрипта:
1. **Рекурсивный поиск файлов** в `src/` и корневых файлах проекта
2. **Автоматическое описание** на основе JSDoc или первой строки кода
3. **Извлечение ключевых функций** (API routes, exports, components)
4. **Обновление статистики** (количество модулей, API, UI, библиотек)
5. **Сохранение форматирования** CODEINDEX.md

### Поддерживаемые типы файлов:
- JavaScript (`.js`, `.cjs`, `.mjs`)
- TypeScript (`.ts`)
- React/Preact (`.jsx`, `.tsx`)

### Автоматически определяет:
- **API Routes**: `export async function GET/POST/PUT/DELETE()`
- **Express Routes**: `app.get/post/put/delete()`
- **React Components**: `export function/const ComponentName`
- **Functions**: `export function functionName()`
- **Classes**: `class ClassName`

### Статистика:
- **Всего модулей**: 26
- **API эндпоинтов**: 1 (medical-api-server.cjs)
- **UI компонентов**: 6 (виджеты и React компоненты)
- **Библиотек**: 0 (в src/lib/)
- **Legacy модулей**: 0

## Техническая реализация:

### Парсинг файлов:
```javascript
// JSDoc комментарии
/**
 * @description Расчёт стоимости перевозки
 */
function calculatePrice() {}

// Первая строка кода
export function sendOrderNotification() {}

// API Routes
export async function POST(request) {}
```

### Обновление статистики:
```javascript
const apiCount = allFiles.filter(f => 
  f.includes('/api/') || f === 'medical-api-server.cjs'
).length;
```

### Сохранение структуры:
- Таблица модулей полностью пересобирается
- Остальные разделы CODEINDEX.md сохраняются
- Приоритетные файлы всегда в начале таблицы

## Влияние:
- **Автоматизация обновления** документации
- **Снижение ручного труда** при поддержке CODEINDEX
- **Актуальная информация** о всех модулях проекта
- **Быстрая адаптация** к изменениям в кодовой базе

## Использование:
```bash
# Запуск индексатора
npm run index

# Или напрямую
node scripts/update-codeindex-simple.js
```

## Результат работы:
```
🔍 Сканирование файлов...
📁 Найдено файлов: 26
✅ CODEINDEX.md обновлён!
📊 Статистика: 26 модулей, 1 API, 6 UI
```

## Преимущества:
1. **Нулевые зависимости** - только Node.js встроенные модули
2. **Быстрая работа** - мгновенное сканирование
3. **Надёжность** - обработка ошибок чтения файлов
4. **Гибкость** - легко расширить для новых паттернов

## Интеграция с AI памятью:
- Скрипт добавлен в `package.json` как `npm run index`
- Обновлены правила в `.windsurf/rules/memory.md`
- Создан bead для документации изменений

---
*Сложность: Medium*
*Статус: Завершено*
