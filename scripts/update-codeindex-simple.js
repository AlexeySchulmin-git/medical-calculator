#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Расширения файлов для индексации
const extensions = ['.js', '.ts', '.jsx', '.tsx', '.cjs', '.mjs'];

// Файлы для исключения
const excludePatterns = ['node_modules', '.next', 'dist', 'build', '.git', 'coverage'];

/**
 * Рекурсивно находит все файлы
 */
function findFiles(dir, basePath = '') {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      if (excludePatterns.some(pattern => item.includes(pattern))) continue;
      
      const fullPath = path.join(dir, item);
      const relativePath = path.join(basePath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findFiles(fullPath, relativePath));
      } else if (extensions.some(ext => item.endsWith(ext))) {
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.warn(`Warning: Cannot read ${dir}: ${error.message}`);
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
    
    // Ищем JSDoc или первую значимую строку
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('/**')) {
        let description = '';
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          const cleanLine = lines[j].trim()
            .replace(/\/\*\*/, '').replace(/\*/, '').replace(/@description\s*/, '').trim();
          if (cleanLine && cleanLine !== '*') description += cleanLine + ' ';
        }
        return description.trim() || 'Модуль без описания';
      }
      
      if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        const match = line.match(/(?:function|class|const|let|var|export)\s+(\w+)/);
        if (match) {
          const name = match[1];
          if (line.includes('function')) return `Функция ${name}`;
          if (line.includes('class')) return `Класс ${name}`;
          if (line.includes('export')) return `Экспорт ${name}`;
          return `Переменная ${name}`;
        }
        return line.substring(0, 40) + (line.length > 40 ? '...' : '');
      }
    }
    
    return 'Модуль без описания';
  } catch (error) {
    return 'Ошибка чтения';
  }
}

/**
 * Извлекает ключевые функции
 */
function extractKeyFunctions(filePath) {
  try {
    const fullPath = path.join(projectRoot, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // API Routes
    const routeMatch = content.match(/export\s+async\s+function\s+(GET|POST|PUT|DELETE)\s*\(/);
    if (routeMatch) {
      const method = routeMatch[1];
      const apiPath = filePath.replace(/.*\/api\//, '/api/').replace(/\/route\.(ts|js)/, '');
      return `${method} ${apiPath}`;
    }
    
    // Express routes
    const expressMatch = content.match(/app\.(get|post|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (expressMatch) {
      const method = expressMatch[1].toUpperCase();
      const path = expressMatch[2];
      return `${method} ${path}`;
    }
    
    // Function exports
    const functionMatches = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g);
    if (functionMatches) {
      return functionMatches.map(f => f.replace(/export\s+(?:async\s+)?function\s+/, '') + '()').join(', ');
    }
    
    // Components
    const componentMatch = content.match(/export\s+(?:default\s+)?(?:function|const)\s+(\w+)/);
    if (componentMatch) {
      return `<${componentMatch[1]}>`;
    }
    
    return 'Основной модуль';
  } catch (error) {
    return 'Ошибка анализа';
  }
}

function main() {
  console.log('🔍 Сканирование файлов...');
  
  // Находим файлы
  const srcFiles = findFiles(path.join(projectRoot, 'src'), 'src');
  const rootFiles = ['medical-api-server.cjs', 'widget-build.js', 'beads-api-server.cjs', 'start.bat']
    .filter(f => fs.existsSync(path.join(projectRoot, f)));
  
  const allFiles = [...rootFiles, ...srcFiles];
  
  console.log(`📁 Найдено файлов: ${allFiles.length}`);
  
  // Создаём новую таблицу
  let newTable = '## 🗂️ ТАБЛИЦА МОДУЛЕЙ\n\n';
  newTable += '| Файл | Что делает | Ключевые функции/эндпоинты |\n';
  newTable += '|------|------------|----------------------------|\n';
  
  // Приоритетные файлы сначала
  const priorityFiles = ['medical-api-server.cjs', 'src/lib/calculator.js', 'src/lib/db.js', 'src/lib/notifications.js'];
  const sortedFiles = [
    ...priorityFiles.filter(f => allFiles.includes(f)),
    ...allFiles.filter(f => !priorityFiles.includes(f))
  ];
  
  sortedFiles.forEach(filePath => {
    const description = extractDescription(filePath);
    const keyFunctions = extractKeyFunctions(filePath);
    newTable += `| \`${filePath}\` | ${description} | ${keyFunctions} |\n`;
  });
  
  // Читаем текущий CODEINDEX
  const codeIndexPath = path.join(projectRoot, 'docs', 'CODEINDEX.md');
  let content = fs.readFileSync(codeIndexPath, 'utf8');
  
  // Обновляем статистику
  const apiCount = allFiles.filter(f => f.includes('/api/') || f === 'medical-api-server.cjs').length;
  const componentCount = allFiles.filter(f => f.includes('/widget/') || f.includes('app/') || f.includes('.jsx')).length;
  const libCount = allFiles.filter(f => f.includes('/lib/')).length;
  const legacyCount = allFiles.filter(f => f.includes('pages/api/')).length;
  
  const statsSection = `## 📊 ОБЩАЯ СТАТИСТИКА
- **Всего модулей**: ${allFiles.length}
- **API эндпоинтов**: ${apiCount}
- **UI компонентов**: ${componentCount}
- **Библиотек**: ${libCount}
- **Legacy модулей**: ${legacyCount}`;
  
  content = content.replace(/## 📊 ОБЩАЯ СТАТИСТИКА[\s\S]*?(?=\n##|$)/, statsSection);
  
  // Обновляем таблицу
  const tableStart = content.indexOf('## 🗂️ ТАБЛИЦА МОДУЛЕЙ');
  const tableEnd = content.indexOf('\n## 🚀', tableStart);
  
  if (tableStart !== -1 && tableEnd !== -1) {
    content = content.substring(0, tableStart) + newTable + content.substring(tableEnd);
  }
  
  // Сохраняем
  fs.writeFileSync(codeIndexPath, content);
  
  console.log('✅ CODEINDEX.md обновлён!');
  console.log(`📊 Статистика: ${allFiles.length} модулей, ${apiCount} API, ${componentCount} UI`);
}

main();
