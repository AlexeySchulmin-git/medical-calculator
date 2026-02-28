#!/usr/bin/env node
/**
 * Улучшенный watcher с chokidar для надёжного слежения за файлами
 * Автоматически обновляет CODEINDEX.md при изменениях
 */

import chokidar from 'chokidar';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const DEBOUNCE_MS = 1500;
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/docs/**',
  '**/scripts/**',
  '**/*.log',
  '**/coverage/**'
];

let debounceTimer = null;
let isRunning = false;
let pendingRun = false;

function log(msg) {
  const time = new Date().toLocaleTimeString('ru-RU');
  console.log(`[${time}] ${msg}`);
}

function runIndexer() {
  if (isRunning) {
    pendingRun = true;
    return;
  }

  isRunning = true;
  pendingRun = false;
  log('🔄 Обновление CODEINDEX...');

  const child = spawn(
    process.execPath,
    [path.join(__dirname, 'update-codeindex-simple.js')],
    { 
      cwd: projectRoot, 
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    }
  );

  child.on('close', (code) => {
    isRunning = false;
    if (code === 0) {
      log('✅ CODEINDEX обновлён');
    } else {
      log(`❌ Ошибка обновления (код ${code})`);
    }
    if (pendingRun) {
      runIndexer();
    }
  });
}

function scheduleRun(filepath) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const relativePath = path.relative(projectRoot, filepath);
    log(`📝 Изменён: ${relativePath}`);
    runIndexer();
  }, DEBOUNCE_MS);
}

// Настройка watcher
const watcher = chokidar.watch([
  'src/**/*.{js,jsx,ts,tsx,cjs,mjs}',
  'public/**/*.{js,css,html}',
  'medical-api-server.cjs',
  'widget-build*.js',
  'package.json'
], {
  cwd: projectRoot,
  ignored: IGNORE_PATTERNS,
  persistent: true,
  ignoreInitial: true
});

watcher
  .on('ready', () => {
    log('🚀 Index watcher запущен (Ctrl+C для остановки)');
    log(`⏱  Debounce: ${DEBOUNCE_MS}ms`);
    log('📂 Слежу за src/, public/, medical-api-server.cjs, widget-build*.js, package.json');
    
    // Первичный запуск при старте
    runIndexer();
  })
  .on('change', (filepath) => {
    scheduleRun(filepath);
  })
  .on('add', (filepath) => {
    scheduleRun(filepath);
  })
  .on('unlink', (filepath) => {
    scheduleRun(filepath);
  })
  .on('error', (error) => {
    log(`❌ Ошибка watcher: ${error}`);
  });

// Graceful shutdown
process.on('SIGINT', () => {
  log('👋 Watcher остановлен');
  watcher.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('👋 Watcher остановлен');
  watcher.close();
  process.exit(0);
});
