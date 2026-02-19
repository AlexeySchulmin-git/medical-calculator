---
title: "Виджет и Админка — 5 исправлений UX"
date: "2026-02-19"
author: "Cascade"
tags: ["widget", "admin", "ux", "fix", "auth"]
status: "completed"
related: ["017-widget-sync-prices.md"]
files_modified:
  - "public/widget-calculator.js"
  - "public/admin.html"
  - "medical-api-server.cjs"
---

## Что сделано

### 1. Убрана зелёная рамка у select-полей виджета
Удалён блок `addEventListener('change', () => el.classList.add('success'))` для полей:
floorDescent, floorAscent, escortCount, medEscortCount.
Зелёная рамка остаётся только у обязательных полей: адреса, вес, телефон, email.

### 2. Ссылки в чекбоксе персональных данных
Текст чекбокса заменён на:
"Принимаю [обработку персональных данных] и [пользовательское соглашение]"
Ссылки берутся из атрибутов виджета: `policy-url` и `agreement-url`.
Пример: `<medical-calculator policy-url="/privacy" agreement-url="/terms">`

Настройка URL в админке: секция "Адрес базы" → два новых поля.
Сохраняются в company_settings (policy_url, agreement_url).
PUT /api/company расширен для этих ключей.

### 3. Починена загрузка данных цен в админке
Причина: loadAllPricing() вызывался без x-api-key заголовка.
Исправление: добавлен `const h = {'x-api-key': apiKey}` и передаётся во все fetch.

### 4. Починен редирект на авторизацию при обновлении страницы
Решение: apiKey сохраняется в sessionStorage.
При загрузке страницы — автоматическая проверка ключа и восстановление сессии.
При logout — ключ удаляется из sessionStorage.

### 5. Кнопки сохранения уже + разделение блоков
- `.btn-save { min-width:160px; max-width:220px }` — кнопки не растягиваются
- `.section` теперь имеет `padding:24px`, `background`, `border`, `border-radius` — каждый блок визуально отделён
- `.section-title` получил `border-bottom` для чёткого разделения заголовка и контента

---
*Сложность: Medium*
*Статус: Завершено*
