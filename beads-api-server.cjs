const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3005;

// Middleware
app.use(cors());
app.use(express.json());

// Beads директория
const beadsDir = path.join(__dirname, 'src/docs/beads');

/**
 * Парсит YAML метаданные
 */
function parseMetadata(yamlString) {
  const metadata = {};
  const lines = yamlString.trim().split('\n');
  
  console.log('🔧 Parsing metadata from:', yamlString.substring(0, 100) + '...');
  
  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      let value = valueParts.join(':').trim();
      console.log(`  📝 Processing: ${key}: ${value} (type: ${typeof value})`);
      
      // Парсим массивы
      if (value.startsWith('[') && value.endsWith(']')) {
        console.log('  🔧 Parsing as array');
        value = value.slice(1, -1)
          .split(',')
          .map(item => item.trim().replace(/['"]/g, ''))
          .filter(item => item.length > 0);
      }
      
      // Убираем кавычки для строковых значений
      else if (typeof value === 'string') {
        console.log('  🔧 Parsing as string');
        value = value.replace(/^['"]|['"]$/g, '');
      }
      
      console.log(`  ✅ Final value:`, value, `(type: ${typeof value})`);
      metadata[key.trim()] = value;
    }
  }
  
  console.log('🎉 Parsed metadata:', metadata);
  return metadata;
}

/**
 * Получает все beads
 */
function getAllBeads() {
  try {
    console.log('🔍 Looking for beads in:', beadsDir);
    console.log('📁 Directory exists:', fs.existsSync(beadsDir));
    
    if (!fs.existsSync(beadsDir)) {
      console.error('❌ Beads directory not found:', beadsDir);
      return [];
    }
    
    const files = fs.readdirSync(beadsDir);
    console.log('📄 All files in directory:', files);
    
    const mdFiles = files.filter(file => file.endsWith('.md')).sort();
    console.log('📝 MD files found:', mdFiles);

    const beads = [];

    for (const file of mdFiles) {
      const filePath = path.join(beadsDir, file);
      console.log(`🔍 Processing file: ${file} at ${filePath}`);
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        console.log(`📖 File ${file} size: ${content.length} chars`);
        
        // Разделяем метаданные и контент
        const parts = content.split('---');
        console.log(`🔧 File ${file} parts count: ${parts.length}`);
        
        if (parts.length < 3) {
          console.warn(`⚠️ File ${file} has invalid format (less than 3 parts)`);
          continue;
        }
        
        const metadata = parseMetadata(parts[1]);
        const body = parts.slice(2).join('---').trim();

        beads.push({
          id: file.replace('.md', ''),
          filename: file,
          metadata,
          body,
          lastModified: fs.statSync(filePath).mtime.toISOString()
        });
        
        console.log(`✅ Successfully parsed bead: ${file}`);
      } catch (fileError) {
        console.error(`❌ Error processing file ${file}:`, fileError.message);
      }
    }

    console.log(`🎉 Total beads processed: ${beads.length}`);
    return beads;
  } catch (error) {
    console.error('❌ Error reading beads:', error);
    return [];
  }
}

/**
 * API Routes
 */

// Получить все beads
app.get('/api/beads', (req, res) => {
  try {
    const beads = getAllBeads();
    
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

    res.json({
      success: true,
      beads,
      index,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Получить конкретный bead
app.get('/api/beads/:id', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(beadsDir, `${id}.md`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Bead not found'
      });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parts = content.split('---');
    
    if (parts.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bead format'
      });
    }

    const metadata = parseMetadata(parts[1]);
    const body = parts.slice(2).join('---').trim();

    res.json({
      success: true,
      bead: {
        id,
        filename: `${id}.md`,
        metadata,
        body,
        lastModified: fs.statSync(filePath).mtime.toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Создать новый bead
app.post('/api/beads', (req, res) => {
  try {
    const { metadata, body } = req.body;
    
    if (!metadata || !body) {
      return res.status(400).json({
        success: false,
        error: 'Metadata and body are required'
      });
    }

    // Генерируем ID
    const existingBeads = getAllBeads();
    const nextId = String(existingBeads.length + 1).padStart(3, '0');
    const filename = `${nextId}-${(metadata.title || 'new').toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
    
    // Создаем содержимое файла
    const content = `---
${Object.entries(metadata).map(([key, value]) => {
  if (Array.isArray(value)) {
    return `${key}: [${value.map(v => `"${v}"`).join(', ')}]`;
  }
  return `${key}: "${value}"`;
}).join('\n')}
---

${body}
`;

    // Записываем файл
    const filePath = path.join(beadsDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');

    res.json({
      success: true,
      bead: {
        id: nextId,
        filename,
        metadata,
        body,
        lastModified: fs.statSync(filePath).mtime.toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// WebSocket для реального времени
const http = require('http');
const server = http.createServer(app);
const { Server } = require("ws");

const wss = new Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected to Beads WebSocket');

  // Отправляем начальные данные
  ws.send(JSON.stringify({
    type: 'initial',
    data: getAllBeads()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'subscribe') {
        // Клиент подписался на обновления
        ws.subscribed = true;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from Beads WebSocket');
  });
});

// Функция для рассылки обновлений
function broadcastUpdate(type, data) {
  const message = JSON.stringify({ type, data });
  
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.subscribed) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// Наблюдаем за изменениями в директории beads
if (fs.existsSync(beadsDir)) {
  fs.watch(beadsDir, (eventType, filename) => {
    if (filename && filename.endsWith('.md')) {
      console.log(`Bead file ${eventType}: ${filename}`);
      
      // Рассылаем обновление всем подключенным клиентам
      broadcastUpdate('bead-updated', {
        eventType,
        filename,
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Запуск сервера
server.listen(PORT, () => {
  console.log(`📚 Beads API Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready for real-time updates`);
});

// Обработка graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down Beads API server...');
  server.close(() => {
    process.exit(0);
  });
});
