import { NextResponse } from 'next/server';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * API endpoint для получения всех beads
 */
export async function GET() {
  try {
    const beadsDir = join(process.cwd(), 'src/docs/beads');
    const files = readdirSync(beadsDir)
      .filter(file => file.endsWith('.md'))
      .sort();

    const beads = [];

    for (const file of files) {
      const filePath = join(beadsDir, file);
      const content = readFileSync(filePath, 'utf-8');
      
      // Разделяем метаданные и контент
      const parts = content.split('---');
      if (parts.length < 3) continue;
      
      const metadata = parseMetadata(parts[1]);
      const body = parts.slice(2).join('---').trim();

      beads.push({
        id: file.replace('.md', ''),
        filename: file,
        metadata,
        body: body.substring(0, 500) + '...' // Предпросмотр
      });
    }

    // Генерируем индекс
    const index = {
      total: beads.length,
      byStatus: {},
      byTags: {},
      lastUpdated: new Date().toISOString()
    };

    beads.forEach(bead => {
      const status = bead.metadata.status;
      index.byStatus[status] = (index.byStatus[status] || 0) + 1;

      const tags = bead.metadata.tags || [];
      tags.forEach(tag => {
        index.byTags[tag] = (index.byTags[tag] || 0) + 1;
      });
    });

    return NextResponse.json({
      success: true,
      beads,
      index
    });

  } catch (error) {
    console.error('Error reading beads:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to read beads' },
      { status: 500 }
    );
  }
}

/**
 * Парсит YAML метаданные
 */
function parseMetadata(yamlString) {
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
