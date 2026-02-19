---
title: "Переключение email на Resend + динамическое примечание виджета"
date: "2026-02-18"
author: "Cascade"
tags: ["email", "resend", "notifications", "widget", "ux"]
status: "completed"
related: ["011-email-notifications.md"]
files_created: []
files_modified:
  - "medical-api-server.cjs"
  - "public/widget-calculator.js"
---

## Что сделано

### Замена nodemailer → Resend SDK
- Установлен пакет `resend` (npm)
- `initMailer()` теперь создаёт `new Resend(process.env.RESEND_API_KEY)`
- `from` адрес: `onboarding@resend.dev` (тестовый домен Resend, не требует верификации)
- `MANAGER_EMAIL` по умолчанию: `alexeyschulmin@gmail.com`
- Graceful degradation: если `RESEND_API_KEY` не задан — письма не отправляются, сервер работает

### Переменные окружения
```
RESEND_API_KEY=re_...
MANAGER_EMAIL=alexeyschulmin@gmail.com
```
Старые SMTP_* переменные больше не нужны для email.

### Динамическое примечание в виджете
В `showResult()` примечание меняется в зависимости от выбранных опций:
- **Нет опций:** `* без учёта платных дорог и выбранных опций. Не является публичной офертой.`
- **Есть опции:** `* без учёта платных дорог. Не является публичной офертой.`

Логика: если опции уже отображены тегами — фраза "и выбранных опций" избыточна.

## Технические решения

### Почему onboarding@resend.dev
В бесплатном плане Resend без верифицированного домена можно слать только с `onboarding@resend.dev`. После добавления домена в Resend — заменить на корпоративный адрес.

## Следующий шаг
Цены из БД — вынести хардкод настроек ценообразования в MySQL.

---
*Сложность: Low*
*Статус: Завершено*
