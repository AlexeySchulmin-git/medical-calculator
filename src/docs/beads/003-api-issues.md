---
title: "Проблемы с API Routes в Next.js"
date: 2026-02-17
author: "Cascade"
tags: ["api", "nextjs", "typescript", "debugging"]
status: "in-progress"
related: ["001-setup.md", "002-widget-mock.md"]
files_created: [
  "src/app/api/widget/config/route.js",
  "src/app/api/dadata/suggest/route.js",
  "src/app/api/dadata/distance/route.js",
  "src/app/api/orders/route.js"
]
files_modified: [
  "next.config.ts",
  "src/types/modules.d.ts"
]
---

# 🐛 Проблемы с API Routes в Next.js

## 📋 Задача
Создать работающие API endpoints для взаимодействия с виджетом, но столкнулся с проблемами конфигурации TypeScript/JavaScript.

## 🔧 Выполненные действия

### Попытки решения
1. **Конвертация .js в .ts**
   - Перевёл все API routes в TypeScript
   - Создал type declarations в `src/types/modules.d.ts`
   - Столкнулся с ошибками импортов модулей

2. **Настройка Next.js конфигурации**
   - Обновил `next.config.ts` для поддержки API
   - Попробовал различные опции experimental
   - Исправил предупреждения о serverComponentsExternalPackages

3. **Создание простых тестовых endpoints**
   - `/api/hello` - базовый тест
   - `/api/test2` - упрощённая версия
   - `/widget-config` - альтернативный путь

## 🚨 Обнаруженные проблемы

### Основная проблема: 404 ошибки
```
GET /api/widget/config 404 in 127ms
GET /api/hello 404 in 2.5s
```

### TypeScript ошибки
```
Cannot find module '@/lib/db' or its corresponding type declarations.
Unexpected any. Specify a different type.
```

### Конфликт модулей
- Next.js ожидает TypeScript в API routes
- JavaScript модули не распознаются корректно
- Path aliases (`@/`) не работают в .js файлах

## 🔍 Диагностика

### Что работает:
- ✅ Главная страница (http://localhost:3000)
- ✅ Next.js сервер запускается
- ✅ Frontend виджет работает

### Что не работает:
- ❌ Любые API endpoints возвращают 404
- ❌ TypeScript компиляция ошибок
- ❌ Module resolution проблемы

## 💡 Попытанные решения

### 1. Упрощённый JavaScript API
```javascript
// src/app/api/widget/config/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  return NextResponse.json({ message: 'API works!' });
}
```
**Результат**: Всё ещё 404

### 2. Изменение next.config.ts
```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: [],
};
```
**Результат**: Убрали предупреждения, но API не работает

### 3. Создание TypeScript declarations
```typescript
// src/types/modules.d.ts
declare module '@/lib/db' {
  const db: any;
  export default db;
}
```
**Результат**: Ошибки TypeScript сохраняются

## 🎯 Текущий статус
- **Проблема**: API routes не работают в Next.js 16.1.6
- **Временное решение**: Mock данные в виджете
- **Необходимо**: Решить проблему с API для реальной функциональности

## 🔄 Следующие шаги
1. **Исследовать проблему** с Next.js API routes
2. **Попробовать альтернативные подходы**:
   - Откатиться на более старую версию Next.js
   - Использовать Pages Router вместо App Router
   - Создать отдельный API сервер
3. **Временное решение**: Расширить mock функционал

## 📝 Выводы
- Mock версия виджета позволяет продолжить разработку
- Проблема с API требует глубокого исследования
- Необходимо выбрать стратегию решения

---
*Время выполнения: ~4 часа*
*Сложность: Высокая*
*Статус: Заблокировано проблемой Next.js*
