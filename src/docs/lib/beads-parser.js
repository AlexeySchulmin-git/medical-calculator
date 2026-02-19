import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Beads Parser - утилита для парсинга markdown файлов с метаданными
 */
export class BeadsParser {
  constructor(beadsDir) {
    this.beadsDir = beadsDir;
    this.beads = [];
  }

  /**
   * Парсит все beads в директории
   */
  async parseAll() {
    const files = readdirSync(this.beadsDir)
      .filter(file => file.endsWith('.md'))
      .sort(); // Сортируем по имени файла для хронологии

    for (const file of files) {
      const bead = await this.parseBead(file);
      this.beads.push(bead);
    }

    return this.beads;
  }

  /**
   * Парсит отдельный bead файл
   */
  async parseBead(filename) {
    const filePath = join(this.beadsDir, filename);
    const content = readFileSync(filePath, 'utf-8');
    
    // Разделяем метаданные и контент
    const parts = content.split('---');
    const metadata = this.parseMetadata(parts[1]);
    const body = parts.slice(2).join('---').trim();

    return {
      id: filename.replace('.md', ''),
      filename,
      metadata,
      body,
      html: this.markdownToHtml(body)
    };
  }

  /**
   * Парсит YAML метаданные
   */
  parseMetadata(yamlString) {
    const metadata = {};
    const lines = yamlString.trim().split('\n');
    
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        let value = valueParts.join(':').trim();
        
        // Парсим массивы
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1)
            .split(',')
            .map(item => item.trim().replace(/['"]/g, ''));
        }
        
        // Убираем кавычки
        value = value.replace(/^['"]|['"]$/g, '');
        
        metadata[key.trim()] = value;
      }
    }
    
    return metadata;
  }

  /**
   * Простая markdown в HTML конвертация
   */
  markdownToHtml(markdown) {
    return markdown
      // Заголовки
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      // Жирный текст
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      // Курсив
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      // Код
      .replace(/`(.*)`/gim, '<code>$1</code>')
      // Ссылки
      .replace(/\[(.*)\]\((.*)\)/gim, '<a href="$2">$1</a>')
      // Списки
      .replace(/^- (.*)$/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      // Параграфы
      .replace(/\n\n/gim, '</p><p>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  /**
   * Получает beads по статусу
   */
  getByStatus(status) {
    return this.beads.filter(bead => bead.metadata.status === status);
  }

  /**
   * Получает beads по тегам
   */
  getByTag(tag) {
    return this.beads.filter(bead => 
      bead.metadata.tags && bead.metadata.tags.includes(tag)
    );
  }

  /**
   * Получает timeline данных
   */
  getTimeline() {
    return this.beads.map(bead => ({
      id: bead.id,
      title: bead.metadata.title,
      date: bead.metadata.date,
      status: bead.metadata.status,
      tags: bead.metadata.tags || [],
      author: bead.metadata.author
    })).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /**
   * Генерирует индекс
   */
  generateIndex() {
    const index = {
      total: this.beads.length,
      byStatus: {},
      byTags: {},
      timeline: this.getTimeline(),
      lastUpdated: new Date().toISOString()
    };

    // Считаем по статусам
    this.beads.forEach(bead => {
      const status = bead.metadata.status;
      index.byStatus[status] = (index.byStatus[status] || 0) + 1;
    });

    // Считаем по тегам
    this.beads.forEach(bead => {
      const tags = bead.metadata.tags || [];
      tags.forEach(tag => {
        index.byTags[tag] = (index.byTags[tag] || 0) + 1;
      });
    });

    return index;
  }
}

export default BeadsParser;
