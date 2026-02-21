---
title: "Исправления: email клиенту, бонусы в уведомлениях, два Resend ключа"
date: "2026-02-20"
author: "Cascade"
tags: ["email", "resend", "loyalty", "bugfix", "notifications"]
status: "completed"
related: ["025-loyalty-widget-ux.md"]
files_created: []
files_modified: ["medical-api-server.cjs", "public/widget-calculator.js"]
---

## Что сделано:

### Исправления бонусов в виджете
- `restoreFormState()` перенесён внутрь `loadPricing()` — теперь вызывается ПОСЛЕ получения `bonus.enabled` с сервера
- `/api/pricing/public` теперь возвращает `bonus: { enabled, percent }` из `pricingCache`
- Блок лояльности корректно показывается при повторном визите (телефон из localStorage)

### Два Resend API ключа
- `RESEND_API_KEY` — старый ключ, привязан к `alexeyschulmin@gmail.com` → письма менеджеру
- `RESEND_CLIENT_API_KEY` — новый ключ, привязан к `alexeyashulmin@gmail.com` → письма клиентам
- `resendManager` и `resendClient` — два отдельных Resend клиента
- `TEST_CLIENT_EMAIL=alexeyashulmin@gmail.com` в `.env.local` — тестовый получатель писем клиента

### Бонусы в уведомлениях
- Email менеджеру: жёлтая строка «⭐ Оплачено бонусами: X ₽ (из Y ₽)»
- Email клиенту: та же строка
- Telegram: `💰 Стоимость: X ₽ _(списано Y бонусов)_`
- `notifyData` использует `finalPrice` (цена после вычета бонусов) + `original_price`, `bonus_used`, `bonus_earned`
- `sendOrderEmails` вызывается с единым `notifyData` объектом

---
*Сложность: Low*
*Статус: Завершено*
