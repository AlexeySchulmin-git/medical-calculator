# Автообновление CODEINDEX.md

## 🚀 Настроенная система

### 1. **Watcher с Chokidar** (реальное время)
```bash
npm run index:watch
```
- Следит за `src/**/*.{js,jsx,ts,tsx,cjs,mjs}`
- Следит за `medical-api-server.cjs`, `widget-build*.js`, `package.json`
- Надёжно работает на Windows/Linux/macOS
- Debounce 1.5 сек для избежания лишних обновлений

### 2. **Git Hooks** (автоматически при коммите)

#### Pre-commit hook:
- Автоматически обновляет CODEINDEX перед коммитом
- Добавляет изменённый CODEINDEX.md в коммит
- Гарантирует актуальную документацию в репозитории

#### Post-commit hook:
- Автоматически запускает watcher после коммита

### 3. **Ручное обновление**
```bash
npm run index
```

---

## 📋 Как это работает

### При разработке:
1. Запустите `npm run index:watch` один раз
2. Изменяйте файлы проекта
3. CODEINDEX.md обновляется автоматически через 1.5 сек
4. Видите логи в консоли

### При коммите:
1. `git commit -m "message"`
2. Pre-commit hook обновляет CODEINDEX
3. Если изменился — автоматически добавляется в коммит
4. Post-commit hook запускает watcher

---

## 🔧 Установка и настройка

### Уже установлено:
- ✅ `chokidar` — надёжный watcher
- ✅ `husky` — Git hooks
- ✅ `scripts/watch-index-chokidar.js` — улучшенный watcher
- ✅ `.husky/pre-commit` — автообновление перед коммитом
- ✅ `.husky/post-commit` — запуск watcher после коммита

### Проверка работы:
```bash
# Тест watcher
npm run index:watch

# Тест pre-commit hook
git add .
git commit -m "test: проверка автообновления CODEINDEX"
```

---

## 🛠️ Troubleshooting

### Watcher не запускается:
```bash
# Проверяем права на файлы
chmod +x scripts/watch-index-chokidar.js

# Запускаем напрямую
node scripts/watch-index-chokidar.js
```

### Git hooks не работают:
```bash
# Переустанавливаем husky
npx husky install

# Проверяем права
chmod +x .husky/pre-commit
chmod +x .husky/post-commit
```

### CODEINDEX не обновляется:
```bash
# Ручное обновление
npm run index

# Проверяем логи watcher
npm run index:watch
```

---

## 📝 Логи watcher

Пример вывода:
```
[20:30:38] 🚀 Index watcher запущен (Ctrl+C для остановки)
[20:30:38] ⏱  Debounce: 1500ms
[20:30:38] 📂 Слежу за src/, medical-api-server.cjs, widget-build*.js, package.json
[20:30:38] 🔄 Обновление CODEINDEX...
[20:30:38] ✅ CODEINDEX обновлён!
[20:31:15] 📝 Изменён: src/widget/Calculator.jsx
[20:31:16] 🔄 Обновление CODEINDEX...
[20:31:16] ✅ CODEINDEX обновлён!
```

---

## 🎯 Рекомендации по использованию

1. **Всегда держите watcher запущенным** при разработке
2. **Коммитьте часто** — CODEINDEX будет всегда актуальным
3. **Проверяйте логи** при проблемах с обновлением
4. **Используйте ручное обновление** если watcher не сработал

---

**Дата создания:** 2026-02-21  
**Обновлено:** 2026-02-21  
**Версия:** 1.0
