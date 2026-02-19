---
title: "Начало проекта - Настройка Next.js и базы данных"
date: 2026-02-17
author: "Cascade"
tags: ["setup", "nextjs", "mysql", "backend"]
status: "completed"
related: []
files_created: [
  "package.json",
  "src/lib/db.js",
  ".env.local",
  "test-client.sql"
]
files_modified: []
---

# 🚀 Начало проекта - Настройка Next.js и базы данных

## 📋 Задача
Создать основу для медицинского калькулятора: настроить Next.js проект, базу данных MySQL и базовую структуру.

## 🔧 Выполненные действия

### Backend настройка
1. **Next.js проект с TypeScript**
   - Инициализирован проект `npx create-next-app@latest`
   - Настроен TypeScript конфигурация
   - Установлены необходимые зависимости

2. **База данных MySQL (XAMPP)**
   - Созданы таблицы: `clients`, `orders`, `address_cache`
   - Настроен connection pool в `src/lib/db.js`
   - Добавлен тестовый клиент через `test-client.sql`

3. **Зависимости**
   ```json
   {
     "mysql2": "^2.3.3",
     "nodemailer": "^6.9.1",
     "react-hook-form": "^7.43.9",
     "axios": "^1.3.4"
   }
   ```

### Переменные окружения
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_NAME=medical_calculator
DADATA_API_KEY=ваш_ключ
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🎯 Результат
- ✅ Next.js проект готов к разработке
- ✅ MySQL база данных настроена
- ✅ Базовая структура создана
- ✅ Тестовый клиент добавлен в БД

## 📝 Примечания
- Используется XAMPP для локальной разработки
- Тестовый API ключ: `test-api-key-12345`
- Тестовый Client ID: `test-client-001`

## 🔄 Следующие шаги
- Создание API routes
- Разработка frontend виджета
- Интеграция с внешними сервисами

---
*Время выполнения: ~2 часа*
*Сложность: Низкая*
