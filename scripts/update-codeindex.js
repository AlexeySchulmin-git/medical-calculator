#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Пути к директориям
const codeIndexPath = path.join(projectRoot, 'docs', 'CODEINDEX.md');

// Расширения файлов для индексации
const extensions = ['.js', '.ts', '.jsx', '.tsx', '.cjs', '.mjs'];

// Файлы для исключения
const excludePatterns = [
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  'coverage'
];

/**
 * Рекурсивно находит все файлы с нужными расширениями
 */
function findFiles(dir, basePath = '') {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      // Пропускаем исключённые директории и файлы
      if (excludePatterns.some(pattern => item.includes(pattern))) {
        continue;
      }
      
      const fullPath = path.join(dir, item);
      const relativePath = path.join(basePath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findFiles(fullPath, relativePath));
      } else if (extensions.some(ext => item.endsWith(ext))) {
        files.push(relativePath);
      }
    }
  } catch (readError) {
    console.warn(`Warning: Cannot read directory ${dir}: ${readError.message}`);
  }
  
  return files;
}

/**
 * Извлекает описание из файла
 */
function extractDescription(filePath) {
  try {
    const fullPath = path.join(projectRoot, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    
    // Ищем JSDoc комментарий
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      
      // JSDoc @description или просто описание
      if (line.startsWith('/**')) {
        // Собираем многострочный JSDoc
        let description = '';
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const jsdocLine = lines[j].trim();
          if (jsdocLine.includes('*/')) break;
          
          // Извлекаем текст из JSDoc
          const cleanLine = jsdocLine
            .replace(/\/\*\*/, '')
            .replace(/\*/, '')
            .replace(/@description\s*/, '')
            .trim();
          
          if (cleanLine && cleanLine !== '*') {
            description += cleanLine + ' ';
          }
        }
        return description.trim() || 'Без описания';
      }
      
      // Если первая строка не пустая и не комментарий
      if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        // Для функций/классов извлекаем имя
        const match = line.match(/(?:function|class|const|let|var)\s+(\w+)/);
        if (match) {
          const name = match[1];
          // Определяем тип по контексту
          if (line.includes('function')) return `Функция ${name}`;
          if (line.includes('class')) return `Класс ${name}`;
          if (line.includes('const') || line.includes('let') || line.includes('var')) {
            return `Переменная ${name}`;
          }
        }
        return line.substring(0, 50) + (line.length > 50 ? '...' : '');
      }
    }
    
    return 'Без описания';
  } catch (readError) {
    console.warn(`Warning: Cannot read directory ${dir}: ${readError.message}`);
    return 'Ошибка чтения файла';
  }
}

/**
 * Извлекает ключевые функции/эндпоинты из файла
 */
function extractKeyFunctions(filePath) {
  try {
    const fullPath = path.join(projectRoot, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    
    const functions = [];
    
    // API Routes (Next.js)
    const routeMatch = content.match(/export\s+async\s+function\s+(GET|POST|PUT|DELETE)\s*\(/);
    if (routeMatch) {
      const method = routeMatch[1];
      const apiPath = filePath.replace(/.*\/api\//, '/api/').replace(/\/route\.(ts|js)/, '');
      functions.push(`${method} ${apiPath}`);
    }
    
    // Express routes
    const expressMatch = content.match(/app\.(get|post|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (expressMatch) {
      const method = expressMatch[1].toUpperCase();
      const path = expressMatch[2];
      functions.push(`${method} ${path}`);
    }
    
    // Function exports
    const functionMatches = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g);
    if (functionMatches) {
      functionMatches.forEach(match => {
        const funcName = match.replace(/export\s+(?:async\s+)?function\s+/, '');
        functions.push(`${funcName}()`);
      });
    }
    
    // Component exports (React)
    const componentMatch = content.match(/export\s+(?:default\s+)?(?:function|const)\s+(\w+).*?=>/s);
    if (componentMatch) {
      const componentName = componentMatch[1];
      functions.push(`<${componentName}>`);
    }
    
    return functions.length > 0 ? functions.join(', ') : 'Основной модуль';
  } catch (analysisError) {
    console.warn(`Warning: Cannot analyze file ${filePath}: ${analysisError.message}`);
    return 'Ошибка анализа';
  }
}

/**
 * Читает текущий CODEINDEX.md
 */
function readCurrentIndex() {
  try {
    const content = fs.readFileSync(codeIndexPath, 'utf8');
    return content;
  } catch (error) {
    console.error('Error reading CODEINDEX.md:', error.message);
    process.exit(1);
  }
}

/**
 * Обновляет статистику в CODEINDEX
 */
function updateStatistics(content, totalFiles) {
  const apiCount = totalFiles.filter(f => f.includes('/api/')).length;
  const componentCount = totalFiles.filter(f => f.includes('/widget/') || f.includes('app/')).length;
  const libCount = totalFiles.filter(f => f.includes('/lib/')).length;
  const legacyCount = totalFiles.filter(f => f.includes('pages/api/')).length;
  
  const statsSection = `## 📊 ОБЩАЯ СТАТИСТИКА
- **Всего модулей**: ${totalFiles.length}
- **API эндпоинтов**: ${apiCount}
- **UI компонентов**: ${componentCount}
- **Библиотек**: ${libCount}
- **Legacy модулей**: ${legacyCount}`;
  
  return content.replace(
    /## 📊 ОБЩАЯ СТАТИСТИКА[\s\S]*?(?=\n##|$)/,
    statsSection
  );
}

/**
 * Обновляет таблицу модулей
 */
function updateModuleTable(content, foundFiles) {
  const tableStart = content.indexOf('## 🗂️ ТАБЛИЦА МОДУЛЕЙ');
  const tableEnd = content.indexOf('\n## 🚀', tableStart);
  
  if (tableStart === -1 || tableEnd === -1) {
    console.error('Cannot find module table in CODEINDEX.md');
    return content;
  }
  
  // Создаём новую таблицу
  let newTable = '## 🗂️ ТАБЛИЦА МОДУЛЕЙ\n\n';
  newTable += '| Файл | Что делает | Ключевые функции/эндпоинты |\n';
  newTable += '|------|------------|----------------------------|\n';
  
  // Добавляем основные файлы проекта (всегда в начале)
  const priorityFiles = [
    'medical-api-server.cjs',
    'src/lib/calculator.js',
    'src/lib/db.js',
    'src/lib/notifications.js'
  ];
  
  const allFiles = [
    ...priorityFiles.filter(f => foundFiles.includes(f)),
    ...foundFiles.filter(f => !priorityFiles.includes(f))
  ];
  
  allFiles.forEach(filePath => {
    const description = extractDescription(filePath);
    const keyFunctions = extractKeyFunctions(filePath);
    newTable += `| \`${filePath}\` | ${description} | ${keyFunctions} |\n`;
  });
  
  // Заменяем старую таблицу новой
  const beforeTable = content.substring(0, tableStart);
  const afterTable = content.substring(tableEnd);
  
  return beforeTable + newTable + afterTable;
}

/**
 * Основная функция
 */
function main() {
  console.log('🔍 Сканирование файлов проекта...');
  
  // Находим все файлы
  const allFiles = findFiles(projectRoot);
  
  // Добавляем основные файлы из корня
  const rootFiles = ['medical-api-server.cjs', 'widget-build.js', 'beads-api-server.cjs']
    .filter(f => fs.existsSync(path.join(projectRoot, f)));
  
  const foundFiles = [...rootFiles, ...allFiles.filter(f => f.startsWith('src/'))];
  
  console.log(`📁 Найдено файлов: ${foundFiles.length}`);
  
  // Читаем текущий индекс
  console.log('📖 Чтение текущего CODEINDEX.md...');
  const currentContent = readCurrentIndex();
  
  // Обновляем статистику
  console.log('📊 Обновление статистики...');
  let updatedContent = updateStatistics(currentContent, foundFiles);
  
  // Обновляем таблицу модулей
  console.log('📋 Обновление таблицы модулей...');
  updatedContent = updateModuleTable(updatedContent, foundFiles);
  
  // Записываем обновлённый файл
  console.log('💾 Сохранение обновлённого CODEINDEX.md...');
  fs.writeFileSync(codeIndexPath, updatedContent);
  
  console.log('✅ CODEINDEX.md успешно обновлён!');
  console.log(`📈 Обновлено модулей: ${foundFiles.length}`);
}

// Запуск
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
