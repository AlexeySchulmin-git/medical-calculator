#!/usr/bin/env node
/**
 * Watcher: следит за изменениями в src/ и корневых .cjs/.js файлах,
 * автоматически запускает update-codeindex-simple.js с debounce 1.5 сек.
 * Только Node.js встроенные модули, без зависимостей.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const DEBOUNCE_MS = 1500;
const WATCH_DIRS = [
  path.join(projectRoot, 'src'),
];
const WATCH_ROOT_EXTS = ['.cjs', '.js', '.ts'];
const IGNORE_PATTERNS = ['node_modules', '.next', 'dist', 'build', '.git', 'docs', 'scripts'];

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
    { cwd: projectRoot, stdio: 'inherit' }
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
    log(`📝 Изменён: ${path.relative(projectRoot, filepath)}`);
    runIndexer();
  }, DEBOUNCE_MS);
}

function shouldIgnore(filepath) {
  return IGNORE_PATTERNS.some(p => filepath.includes(p));
}

function watchDir(dir) {
  if (!fs.existsSync(dir)) return;

  try {
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(dir, filename);
      if (shouldIgnore(fullPath)) return;

      const ext = path.extname(filename);
      if (['.js', '.ts', '.jsx', '.tsx', '.cjs', '.mjs'].includes(ext)) {
        scheduleRun(fullPath);
      }
    });
    log(`👁  Слежу за: ${path.relative(projectRoot, dir)}/`);
  } catch (err) {
    log(`⚠️  Не удалось следить за ${dir}: ${err.message}`);
  }
}

function watchRootFiles() {
  try {
    fs.watch(projectRoot, (eventType, filename) => {
      if (!filename) return;
      const ext = path.extname(filename);
      if (!WATCH_ROOT_EXTS.includes(ext)) return;
      if (shouldIgnore(filename)) return;

      const fullPath = path.join(projectRoot, filename);
      scheduleRun(fullPath);
    });
    log(`👁  Слежу за корневыми файлами: ${WATCH_ROOT_EXTS.join(', ')}`);
  } catch (err) {
    log(`⚠️  Не удалось следить за корнем: ${err.message}`);
  }
}

// Запуск
log('🚀 Index watcher запущен (Ctrl+C для остановки)');
log(`⏱  Debounce: ${DEBOUNCE_MS}ms`);
log(`📂 Директории для слежения: ${WATCH_DIRS.map(d => path.relative(projectRoot, d)).join(', ')}`);
log(`📄 Корневые файлы: ${WATCH_ROOT_EXTS.join(', ')}`);

WATCH_DIRS.forEach(watchDir);
watchRootFiles();

// Первичный запуск при старте
runIndexer();

// Graceful shutdown
process.on('SIGINT', () => {
  log('👋 Watcher остановлен');
  process.exit(0);
});
