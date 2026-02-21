@echo off
title Medical Calculator

echo Останавливаем node процессы...
taskkill /F /IM node.exe /T 2>nul
timeout /t 1 /nobreak >nul

echo Запускаем API сервер...
start "API Server" cmd /k "cd /d %~dp0 && node medical-api-server.cjs"

timeout /t 2 /nobreak >nul

echo Запускаем Next.js...
start "Next.js" cmd /k "cd /d %~dp0 && npm run dev"

timeout /t 2 /nobreak >nul

echo Запускаем Index Watcher...
start "Index Watcher" cmd /k "cd /d %~dp0 && npm run index:watch"

echo.
echo ✅ Запущено!
echo    API:    http://localhost:3003
echo    Admin:  http://localhost:3003/admin.html
echo    Widget: http://localhost:3000
echo    Index:  авто-обновление CODEINDEX активно
echo.
