const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const https = require('https');
const { Resend } = require('resend');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection
let pool;

async function initializeDatabase() {
  try {
    const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });

    // Проверяем подключение
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    client.release();

    // Таблица базовых настроек цен
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pricing_settings (
        key VARCHAR(50) PRIMARY KEY,
        value DECIMAL(10,2) NOT NULL,
        label VARCHAR(100),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      INSERT INTO pricing_settings (key, value, label) VALUES
        ('per_km',           45,   'Стоимость за км (₽)'),
        ('base_fixed_add',   0,    'Фикс. надбавка к стоимости (₽, может быть отрицательной)'),
        ('base_coeff',       0,    'Коэффициент % к итоговой стоимости (0 = выключено)'),
        ('waiting_30min',    500,  'Ожидание за 30 мин (₽)'),
        ('oxygen_fee',       800,  'Кислород (₽)'),
        ('no_escort_fee',    300,  'Без сопровождения (₽)'),
        ('round_trip_type',  0,    'Туда-обратно: 0=коэфф%, 1=фикс. сумма'),
        ('round_trip_value', 80,   'Туда-обратно: значение (% или ₽, может быть отрицательным)')
      ON CONFLICT (key) DO NOTHING
    `);

    // Таблица настроек компании
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL,
        label VARCHAR(100),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      INSERT INTO company_settings (key, value, label) VALUES
        ('base_address',  'Раменское, Махова, 14', 'Адрес базы (стартовая точка)'),
        ('base_coords',   '55.5667,38.2000',       'Координаты базы (lat,lon)'),
        ('policy_url',    '',                       'Ссылка на политику конфиденциальности'),
        ('agreement_url', '',                       'Ссылка на пользовательское соглашение')
      ON CONFLICT (key) DO NOTHING
    `);

    // Таблица тарифов спуска/подъёма по весу
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pricing_floor_tiers (
        id SERIAL PRIMARY KEY,
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('descent','ascent')),
        weight_from INT NOT NULL,
        weight_to INT,
        price_per_floor DECIMAL(10,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (direction, weight_from)
      )
    `);

    await pool.query(`
      INSERT INTO pricing_floor_tiers (direction, weight_from, weight_to, price_per_floor) VALUES
        ('descent', 0,   90,   250),
        ('descent', 91,  100,  350),
        ('descent', 101, NULL, 450),
        ('ascent',  0,   90,   350),
        ('ascent',  91,  100,  450),
        ('ascent',  101, NULL, 550)
      ON CONFLICT (direction, weight_from) DO NOTHING
    `);

    // Таблица городских коэффициентов и фиксированных цен
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pricing_city_rates (
        id SERIAL PRIMARY KEY,
        city_name VARCHAR(100) NOT NULL UNIQUE,
        rate_type VARCHAR(10) NOT NULL DEFAULT 'percent' CHECK (rate_type IN ('fixed','percent','flat_km')),
        value DECIMAL(10,2) NOT NULL DEFAULT 0,
        is_fixed_price BOOLEAN NOT NULL DEFAULT FALSE,
        note VARCHAR(200),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      INSERT INTO pricing_city_rates (city_name, rate_type, value, is_fixed_price, note) VALUES
        ('Москва', 'percent', 30, false, 'Наценка 30% из-за пробок'),
        ('Раменское', 'fixed', 4500, true, 'Фиксированная цена по городу')
      ON CONFLICT (city_name) DO NOTHING
    `);

    // Таблица клиентов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(200),
        api_key VARCHAR(100) UNIQUE NOT NULL,
        settings TEXT,
        telegram_chat_id VARCHAR(50) DEFAULT NULL,
        google_spreadsheet_id VARCHAR(200) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица заявок
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        client_id INT REFERENCES clients(id),
        customer_name VARCHAR(200),
        phone VARCHAR(50) NOT NULL,
        customer_email VARCHAR(200),
        from_address TEXT,
        to_address TEXT,
        floor_num INT DEFAULT 1,
        no_elevator BOOLEAN DEFAULT FALSE,
        diagnosis TEXT,
        weight DECIMAL(6,2),
        round_trip BOOLEAN DEFAULT FALSE,
        payment_method VARCHAR(50),
        medical_escort BOOLEAN DEFAULT FALSE,
        comment TEXT,
        distance DECIMAL(8,2),
        price DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица кэша адресов DaData
    await pool.query(`
      CREATE TABLE IF NOT EXISTS address_cache (
        cache_key VARCHAR(500) PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица покупателей (для системы лояльности)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(50) NOT NULL UNIQUE,
        bonus_balance INT NOT NULL DEFAULT 0,
        total_orders INT NOT NULL DEFAULT 0,
        total_spent DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Настройки лояльности в pricing_settings
    await pool.query(`
      INSERT INTO pricing_settings (key, value, label) VALUES
        ('loyalty_enabled', 0,  'Система лояльности: 1=вкл, 0=выкл'),
        ('loyalty_percent', 5,  'Процент начисления бонусов от суммы заказа')
      ON CONFLICT (key) DO NOTHING
    `);

    // Миграция: добавляем колонки если ещё нет
    try {
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50) DEFAULT NULL`);
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_spreadsheet_id VARCHAR(200) DEFAULT NULL`);
    } catch (_) { /* игнорируем */ }

    // Миграция orders: добавляем колонки для бонусов
    try {
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_earned INT DEFAULT 0`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_used INT DEFAULT 0`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS escort_count INT DEFAULT 1`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS floor_descent INT DEFAULT 0`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS floor_ascent INT DEFAULT 0`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS need_oxygen BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20)`);
    } catch (_) { /* игнорируем */ }

    // Миграция customers: нормализация телефонов + объединение дубликатов
    try {
      // Шаг 1: нормализуем все телефоны — убираем нецифровые символы, приводим к 11 цифрам
      // regexp_replace с 'g' поддерживается в PostgreSQL 9.4+
      await pool.query(`
        UPDATE customers
        SET phone = CASE
          WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) = 10
            THEN '7' || regexp_replace(phone, '[^0-9]', '', 'g')
          ELSE regexp_replace(phone, '[^0-9]', '', 'g')
        END
        WHERE phone ~ '[^0-9]' OR (phone ~ '^[0-9]{10}$')
      `);
      // Шаг 2: объединяем дубликаты — суммируем баллы/заказы/траты, оставляем MIN(id)
      await pool.query(`
        WITH dupes AS (
          SELECT phone,
                 SUM(bonus_balance) AS total_bonus,
                 SUM(total_orders)  AS total_ord,
                 SUM(total_spent)   AS total_sp,
                 MIN(created_at)    AS first_seen,
                 MIN(id)            AS keep_id
          FROM customers
          GROUP BY phone
          HAVING COUNT(*) > 1
        )
        UPDATE customers c
        SET bonus_balance = d.total_bonus,
            total_orders  = d.total_ord,
            total_spent   = d.total_sp,
            created_at    = d.first_seen
        FROM dupes d
        WHERE c.id = d.keep_id
      `);
      await pool.query(`
        DELETE FROM customers
        WHERE id NOT IN (
          SELECT MIN(id) FROM customers GROUP BY phone
        )
      `);
      console.log('✅ Миграция customers: телефоны нормализованы, дубликаты объединены');
    } catch (migErr) { console.warn('⚠️  Миграция customers:', migErr.message); }

    // Загружаем настройки в кэш
    await loadPricingSettings();

    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('⚠️  Using mock data instead');
    return null;
  }
}

// Initialize database on startup
initializeDatabase().catch(console.error);

// Кэш настроек ценообразования
let pricingCache = {
  per_km: 45,
  waiting_30min: 500,
  oxygen_fee: 800,
  no_escort_fee: 300,
  loyalty_enabled: 0,
  loyalty_percent: 5
};

// Кэш тарифов этажей: { descent: [{weight_from,weight_to,price_per_floor},...], ascent: [...] }
let floorTiersCache = { descent: [], ascent: [] };

// Кэш городских ставок: [{id, city_name, rate_type, value, is_fixed_price, note}]
let cityRatesCache = [];

// Кэш настроек компании: { base_address, base_coords }
let companyCache = { base_address: 'Раменское, Махова, 14', base_coords: '55.5667,38.2000' };

async function loadPricingSettings() {
  if (!pool) return;
  try {
    const { rows } = await pool.query('SELECT key, value FROM pricing_settings');
    rows.forEach(row => { pricingCache[row.key] = parseFloat(row.value); });

    const tiersRes = await pool.query('SELECT * FROM pricing_floor_tiers ORDER BY direction, weight_from');
    floorTiersCache.descent = tiersRes.rows.filter(t => t.direction === 'descent');
    floorTiersCache.ascent  = tiersRes.rows.filter(t => t.direction === 'ascent');

    const citiesRes = await pool.query('SELECT * FROM pricing_city_rates ORDER BY city_name');
    cityRatesCache = citiesRes.rows;

    const companyRes = await pool.query('SELECT key, value FROM company_settings');
    companyRes.rows.forEach(r => { companyCache[r.key] = r.value; });

    console.log('✅ Pricing settings loaded from DB');
  } catch (err) {
    console.log('⚠️  Could not load pricing from DB, using defaults:', err.message);
  }
}

// Найти тариф этажа по весу и направлению
// round_trip_type: 0 = коэфф%, 1 = фикс. сумма (может быть отрицательной)
function getFloorPrice(direction, weight) {
  const tiers = floorTiersCache[direction] || [];
  for (const t of tiers) {
    const from = t.weight_from;
    const to   = t.weight_to === null || t.weight_to === undefined ? Infinity : t.weight_to;
    if (weight >= from && weight <= to) return parseFloat(t.price_per_floor);
  }
  return direction === 'descent' ? 250 : 350; // fallback
}

// Нормализация телефона: оставляем только цифры, приводим к формату 7XXXXXXXXXX
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return digits;
  if (digits.length === 10) return '7' + digits;
  return digits || null;
}

// Найти городскую ставку по названию города (частичное совпадение)
function findCityRate(cityName) {
  if (!cityName) return null;
  const name = cityName.toLowerCase();
  return cityRatesCache.find(c => name.includes(c.city_name.toLowerCase())) || null;
}

// ── TELEGRAM ─────────────────────────────────────────
function telegramRequest(token, method, body) {
  const payload = JSON.stringify(body);
  const url = `https://api.telegram.org/bot${token}/${method}`;
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', err => { console.error('❌ Telegram request error:', err.message); resolve({ ok: false }); });
    req.write(payload);
    req.end();
  });
}

async function sendTelegramNotification(order, chatId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;

  const options = [
    order.floor_descent !== undefined && order.floor_descent !== null 
      ? `⬇️ Спуск: ${order.floor_descent === 0 ? 'Не нужен' : order.floor_descent + ' эт.'}` 
      : null,
    order.floor_ascent !== undefined && order.floor_ascent !== null 
      ? `⬆️ Подъём: ${order.floor_ascent === 0 ? 'Не нужен' : order.floor_ascent + ' эт.'}` 
      : null,
    order.medical_escort    ? `🩺 Мед. сопровождение` : null,
    order.need_oxygen       ? `💨 Кислород` : null,
    order.round_trip        ? `🔄 Туда-обратно` : null,
    order.escort_count > 0  ? `👥 Сопровождение: ${order.escort_count} чел.` : null
  ].filter(v => v).join(', ');

  const text = [
    `🚑 *Новая заявка ${order.orderNumber}*`,
    ``,
    `📞 ${order.phone}${order.email ? ' | ' + order.email : ''}`,
    order.customer_name ? `👤 ${order.customer_name}` : null,
    ``,
    `📍 *Откуда:* ${order.from_address}`,
    `📍 *Куда:* ${order.to_address}`,
    order.distance ? `🛣 Расстояние: ${order.distance} км` : null,
    ``,
    `💰 *Стоимость: ${Number(order.price).toLocaleString('ru-RU')} ₽*${order.bonus_used > 0 ? ` _(списано ${order.bonus_used} бонусов)_` : ''}`,
    order.weight ? `⚖️ Вес: ${order.weight} кг` : null,
    order.diagnosis ? `🏥 Диагноз: ${order.diagnosis}` : null,
    options ? `\n${options}` : null,
    order.comment ? `\n💬 ${order.comment}` : null,
  ].filter(v => v !== null).join('\n');

  const result = await telegramRequest(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
  if (!result.ok) console.error('❌ Telegram error:', result.description);
  else console.log(`✅ Telegram notification sent to ${chatId}`);
}

// Webhook: обработка /start от пользователя бота
// Пользователь пишет боту: /start <api_key>
// Бот сохраняет его chat_id в БД по api_key
app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200); // Telegram требует быстрый ответ
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    const update = req.body;
    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = String(msg.chat.id);
    const text   = msg.text.trim();

    if (text.startsWith('/start')) {
      const parts  = text.split(' ');
      const apiKey = parts[1] ? parts[1].trim() : null;

      if (!apiKey) {
        await telegramRequest(token, 'sendMessage', {
          chat_id: chatId,
          text: '👋 Привет! Чтобы подключить уведомления, отправьте:\n\n`/start ВАШ_API_КЛЮЧ`\n\nAPI-ключ можно найти в вашей панели управления.',
          parse_mode: 'Markdown'
        });
        return;
      }

      if (!pool) {
        await telegramRequest(token, 'sendMessage', { chat_id: chatId, text: '❌ Сервер временно недоступен.' });
        return;
      }

      const clientsRes = await pool.query('SELECT id, company_name FROM clients WHERE api_key = $1', [apiKey]);
      if (clientsRes.rows.length === 0) {
        await telegramRequest(token, 'sendMessage', { chat_id: chatId, text: '❌ API-ключ не найден. Проверьте правильность ключа.' });
        return;
      }

      await pool.query('UPDATE clients SET telegram_chat_id = $1 WHERE api_key = $2', [chatId, apiKey]);
      const companyName = clientsRes.rows[0].company_name || 'ваша компания';
      await telegramRequest(token, 'sendMessage', {
        chat_id: chatId,
        text: `✅ Готово! Уведомления для *${companyName}* подключены.\n\nТеперь вы будете получать сообщения о каждой новой заявке.`,
        parse_mode: 'Markdown'
      });
      console.log(`✅ Telegram chat_id ${chatId} linked to client ${clientsRes.rows[0].id}`);
    }
  } catch (err) {
    console.error('❌ Telegram webhook error:', err.message);
  }
});

// ── GOOGLE SHEETS ─────────────────────────────────────
let sheetsClient = null;

async function initGoogleSheets() {
  const jsonEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  if (!jsonEnv && !keyFile) {
    console.log('⚠️  Google Sheets not configured (GOOGLE_SERVICE_ACCOUNT_JSON not set)');
    return;
  }
  try {
    let authConfig;
    if (jsonEnv) {
      authConfig = { credentials: JSON.parse(jsonEnv), scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
    } else {
      authConfig = { keyFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
    }
    const auth = new google.auth.GoogleAuth(authConfig);
    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets client initialized');
  } catch (err) {
    console.error('❌ Google Sheets init error:', err.message);
  }
}

async function appendOrderToSheet(order, spreadsheetId) {
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Заявки';
  if (!sheetsClient || !spreadsheetId) return;
  try {
    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const row = [
      now,
      order.orderNumber,
      order.phone,
      order.email || '',
      order.customer_name || '',
      order.from_address,
      order.to_address,
      order.distance || 0,
      order.price,
      order.weight || '',
      order.diagnosis || '',
      order.floor_descent || 0,
      order.floor_ascent  || 0,
      order.medical_escort ? 'Да' : 'Нет',
      order.need_oxygen    ? 'Да' : 'Нет',
      order.round_trip     ? 'Да' : 'Нет',
      order.comment || '',
      'Новая',
    ];
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    console.log(`✅ Order appended to Google Sheets (${spreadsheetId})`);
  } catch (err) {
    console.error('❌ Google Sheets append error:', err.message);
  }
}

initGoogleSheets();

// Resend email клиенты (менеджер и клиент могут иметь разные API ключи)
let resendManager = null;
let resendClient  = null;

function initMailer() {
  const managerKey = process.env.RESEND_API_KEY;
  const clientKey  = process.env.RESEND_CLIENT_API_KEY || managerKey;

  if (!managerKey) {
    console.log('⚠️  RESEND_API_KEY not configured, email notifications disabled');
    return;
  }
  resendManager = new Resend(managerKey);
  resendClient  = clientKey ? new Resend(clientKey) : resendManager;
  console.log(`✅ Resend email client initialized (manager key: ...${managerKey.slice(-6)}, client key: ...${clientKey.slice(-6)})`);
}

initMailer();

async function sendOrderEmails(order) {
  if (!resendManager) { console.log('⚠️ Resend not initialized, skipping email'); return; }

  const managerEmail  = process.env.MANAGER_EMAIL || 'alexeyschulmin@gmail.com';
  const testClientEmail = process.env.TEST_CLIENT_EMAIL || '';
  const clientEmailTo = order.email || testClientEmail;

  console.log(`📧 sendOrderEmails: manager=${managerEmail}, client=${clientEmailTo || 'none'}, TEST_CLIENT_EMAIL=${testClientEmail}`);

  const optionsList = [
    order.floor_descent > 0 ? `Спуск без лифта: ${order.floor_descent} эт.` : null,
    order.floor_ascent > 0  ? `Подъём без лифта: ${order.floor_ascent} эт.` : null,
    order.medical_escort    ? `Мед. сопровождение (${order.med_escort_count || 1} врач)` : null,
    order.escort_count > 0  ? `Сопровождение: ${order.escort_count} чел.` : null,
    order.need_oxygen       ? 'Кислород' : null,
    order.round_trip        ? 'Туда и обратно' : null,
  ].filter(Boolean);

  const bonusRow = order.bonus_used > 0
    ? `<tr><td style="padding:6px 12px;background:#fef9c3;font-weight:600">⭐ Оплачено бонусами</td><td style="padding:6px 12px;color:#854d0e"><strong>${order.bonus_used} ₽</strong> (из ${order.original_price} ₽)</td></tr>`
    : '';

  // Письмо менеджеру
  const managerHtml = `
<h2>Новая заявка ${order.orderNumber}</h2>
<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Откуда</td><td style="padding:6px 12px">${order.from_address}</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Куда</td><td style="padding:6px 12px">${order.to_address}</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Расстояние</td><td style="padding:6px 12px">${order.distance} км</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Стоимость к оплате</td><td style="padding:6px 12px"><strong>${order.price} ₽</strong></td></tr>
  ${bonusRow}
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Телефон</td><td style="padding:6px 12px">${order.phone}</td></tr>
  ${order.email ? `<tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Email</td><td style="padding:6px 12px">${order.email}</td></tr>` : ''}
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Вес</td><td style="padding:6px 12px">${order.weight} кг</td></tr>
  ${order.diagnosis ? `<tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Диагноз</td><td style="padding:6px 12px">${order.diagnosis}</td></tr>` : ''}
  ${optionsList.length > 0 ? `<tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Опции</td><td style="padding:6px 12px">${optionsList.join(', ')}</td></tr>` : ''}
  ${order.comment ? `<tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Комментарий</td><td style="padding:6px 12px">${order.comment}</td></tr>` : ''}
</table>
<p style="color:#64748b;font-size:12px;margin-top:16px">Заявка получена: ${new Date().toLocaleString('ru-RU')}</p>
  `;

  try {
    const { data, error } = await resendManager.emails.send({
      from: 'Медицинский калькулятор <onboarding@resend.dev>',
      to: [managerEmail],
      subject: `🚑 Новая заявка ${order.orderNumber} — ${order.phone}`,
      html: managerHtml
    });
    if (error) console.error('❌ Manager email error:', JSON.stringify(error));
    else console.log(`✅ Manager email sent to ${managerEmail}, id: ${data.id}`);
  } catch (err) {
    console.error('❌ Manager email exception:', err.message);
  }

  // Письмо клиенту
  if (!clientEmailTo) { console.log('⚠️ No client email, skipping'); return; }

  const clientHtml = `
<h2>Ваша заявка принята!</h2>
<p>Номер заявки: <strong>${order.orderNumber}</strong></p>
<p>Мы свяжемся с вами по номеру <strong>${order.phone}</strong> в ближайшее время.</p>
<h3>Детали заявки:</h3>
<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Откуда</td><td style="padding:6px 12px">${order.from_address}</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Куда</td><td style="padding:6px 12px">${order.to_address}</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Расстояние</td><td style="padding:6px 12px">${order.distance} км</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Стоимость к оплате</td><td style="padding:6px 12px"><strong>${order.price} ₽</strong></td></tr>
  ${bonusRow}
  ${optionsList.length > 0 ? `<tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Опции</td><td style="padding:6px 12px">${optionsList.join(', ')}</td></tr>` : ''}
</table>
<p style="color:#64748b;font-size:12px;margin-top:16px">Стоимость предварительная, без учёта платных дорог. Не является публичной офертой.</p>
  `;

  try {
    const { data, error } = await resendClient.emails.send({
      from: 'Медицинский калькулятор <onboarding@resend.dev>',
      to: [clientEmailTo],
      subject: `Ваша заявка ${order.orderNumber} принята`,
      html: clientHtml
    });
    if (error) console.error('❌ Client email error:', JSON.stringify(error));
    else console.log(`✅ Client email sent to ${clientEmailTo}, id: ${data.id}`);
  } catch (err) {
    console.error('❌ Client email exception:', err.message);
  }
}

// Widget config endpoint
app.get('/api/widget/config', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Если база данных недоступна, используем mock данные
    if (!pool) {
      return res.json({
        client_id: 'test-client-001',
        company_name: 'Тестовая медицинская компания',
        settings: {
          fields: {
            from_address: true,
            to_address: true,
            floor: true,
            no_elevator: true,
            diagnosis: true,
            weight: true,
            phone: true,
            email: true,
            round_trip: true,
            payment_method: true,
            medical_escort: true,
            news_subscribe: true,
            personal_data: true
          },
          required: ['phone', 'from_address', 'to_address', 'personal_data'],
          pricing: { ...pricingCache },
          bonus: {
            enabled: pricingCache.loyalty_enabled,
            percent: pricingCache.loyalty_percent
          },
          personal_data_url: '/privacy',
          ui: {
            primary_color: '#3b82f6',
            bg_color: '#ffffff',
            font_size: '16px',
            border_radius: '8px'
          }
        }
      });
    }

    // Ищем клиента в базе данных
    const clientsRes = await pool.query(
      'SELECT * FROM clients WHERE api_key = $1',
      [apiKey]
    );

    if (clientsRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const client = clientsRes.rows[0];
    
    // Настройки по умолчанию
    const defaultSettings = {
      fields: {
        from_address: true,
        to_address: true,
        floor: true,
        no_elevator: true,
        diagnosis: true,
        weight: true,
        phone: true,
        email: true,
        round_trip: true,
        payment_method: true,
        medical_escort: true,
        news_subscribe: true,
        personal_data: true
      },
      required: ['phone', 'from_address', 'to_address', 'personal_data'],
      pricing: { ...pricingCache },
      bonus: {
        enabled: !!pricingCache.loyalty_enabled,
        percent: pricingCache.loyalty_percent || 5
      },
      personal_data_url: '/privacy',
      ui: {
        primary_color: '#3b82f6',
        bg_color: '#ffffff',
        font_size: '16px',
        border_radius: '8px'
      }
    };

    // Объединяем с настройками клиента
    const settings = {
      ...defaultSettings,
      ...(client.settings && JSON.parse(client.settings))
    };

    res.json({
      client_id: client.id,
      company_name: client.company_name,
      settings
    });

  } catch (error) {
    console.error('Config API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Calculate price endpoint (для предварительного расчёта в виджете)
app.post('/api/calculate-price', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });

    const body = req.body;
    const priceData = {
      totalDistance: parseFloat(body.total_distance || body.distance) || 0,
      fromCity: body.from_city || body.from_address || '',
      toCity:   body.to_city   || body.to_address   || '',
      weight:        parseFloat(body.weight) || 0,
      descentFloors: parseInt(body.descent_floors || body.floor_descent) || 0,
      ascentFloors:  parseInt(body.ascent_floors  || body.floor_ascent)  || 0,
      waitingSlots:  parseInt(body.waiting_slots)  || 0,
      needOxygen: !!body.need_oxygen,
      noEscort:   body.no_escort !== undefined ? !!body.no_escort : false,
      roundTrip:  !!body.round_trip,
    };

    const price = calculatePrice(priceData);
    console.log(`💰 /api/calculate-price: dist=${priceData.totalDistance} from="${priceData.fromCity.slice(0,30)}" to="${priceData.toCity.slice(0,30)}" → ${price}₽`);

    return res.json({ success: true, price });
  } catch (error) {
    console.error('Calculate price error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Orders endpoint
app.post('/api/orders', async (req, res) => {
  try {
    const body = req.body;
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    if (!pool) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    // Валидация обязательных полей
    const requiredFields = ['phone', 'from_address', 'to_address'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return res.status(400).json({ error: `Field ${field} is required` });
      }
    }

    // Проверка API ключа
    const clientsRes = await pool.query(
      'SELECT id, telegram_chat_id, google_spreadsheet_id FROM clients WHERE api_key = $1',
      [apiKey]
    );

    if (clientsRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const clientId            = clientsRes.rows[0].id;
    const clientTgChatId      = clientsRes.rows[0].telegram_chat_id      || null;
    const clientSpreadsheetId = clientsRes.rows[0].google_spreadsheet_id || null;

    // Генерируем уникальный номер заявки
    const orderNumber = `ORD-${String(Date.now()).slice(-8)}-${Math.floor(Math.random() * 100)}`;

    // Расчёт стоимости
    const priceData = {
      totalDistance: body.total_distance || body.distance || 0,
      fromCity: body.from_city || body.from_address || '',
      toCity:   body.to_city   || body.to_address   || '',
      weight:   parseFloat(body.weight) || 0,
      descentFloors: parseInt(body.floor_descent || body.descent_floors) || 0,
      ascentFloors:  parseInt(body.floor_ascent  || body.ascent_floors)  || 0,
      waitingSlots:  parseInt(body.waiting_slots)  || 0,
      needOxygen: !!body.need_oxygen,
      noEscort:   body.no_escort !== undefined ? !!body.no_escort : (parseInt(body.escort_count) === 0),
      roundTrip:  !!body.round_trip,
    };

    const calculatedPrice = calculatePrice(priceData);

    // Сохраняем заявку в базу данных
    await pool.query(`
      INSERT INTO orders (
        client_id, order_number, customer_name, phone, customer_email,
        from_address, to_address, floor_num, no_elevator,
        diagnosis, weight, round_trip, payment_method,
        medical_escort, comment, distance, price, status,
        floor_descent, floor_ascent, need_oxygen, escort_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    `, [
      clientId,
      orderNumber,
      body.customer_name || '',
      body.phone,
      body.email || '',
      body.from_address,
      body.to_address,
      body.floor_num || 1,
      body.no_elevator ? true : false,
      body.diagnosis || '',
      parseFloat(body.weight) || 0,
      body.round_trip ? true : false,
      body.payment_method || '',
      body.medical_escort ? true : false,
      body.comment || '',
      parseFloat(body.distance) || 0,
      calculatedPrice,
      'new',
      parseInt(body.floor_descent) || 0,
      parseInt(body.floor_ascent) || 0,
      body.need_oxygen ? true : false,
      parseInt(body.escort_count) || 0
    ]);

    // Система лояльности: списание и начисление бонусов
    const bonusUsed   = parseInt(body.bonus_used) || 0;
    let   bonusEarned = 0;
    const finalPrice  = Math.max(0, calculatedPrice - bonusUsed);

    if (pricingCache.loyalty_enabled && body.phone) {
      const phone = normalizePhone(body.phone);
      bonusEarned = Math.round(finalPrice * (pricingCache.loyalty_percent || 5) / 100);

      // Списание: уменьшаем баланс (не уходим в минус)
      if (bonusUsed > 0) {
        pool.query(`
          UPDATE customers SET
            bonus_balance = GREATEST(0, bonus_balance - $1),
            updated_at    = CURRENT_TIMESTAMP
          WHERE phone = $2
        `, [bonusUsed, phone]).catch(err => console.error('Loyalty deduct error:', err.message));
      }

      // Начисление: upsert клиента
      if (bonusEarned > 0) {
        pool.query(`
          INSERT INTO customers (phone, bonus_balance, total_orders, total_spent)
          VALUES ($1, $2, 1, $3)
          ON CONFLICT (phone) DO UPDATE
            SET bonus_balance = customers.bonus_balance + $2,
                total_orders  = customers.total_orders + 1,
                total_spent   = customers.total_spent + $3,
                updated_at    = CURRENT_TIMESTAMP
        `, [phone, bonusEarned, finalPrice]).catch(err => console.error('Loyalty earn error:', err.message));
      } else if (bonusUsed === 0) {
        // Первый заказ — просто создаём запись клиента без баллов
        pool.query(`
          INSERT INTO customers (phone, total_orders, total_spent)
          VALUES ($1, 1, $2)
          ON CONFLICT (phone) DO UPDATE
            SET total_orders = customers.total_orders + 1,
                total_spent  = customers.total_spent + $2,
                updated_at   = CURRENT_TIMESTAMP
        `, [phone, finalPrice]).catch(err => console.error('Loyalty upsert error:', err.message));
      }
    }

    // Отправляем уведомления (не блокируем ответ)
    const notifyData = {
      orderNumber,
      customer_name: body.customer_name || '',
      from_address: body.from_address,
      to_address: body.to_address,
      distance: body.distance || 0,
      price: finalPrice,
      original_price: calculatedPrice,
      bonus_used: bonusUsed,
      bonus_earned: bonusEarned,
      phone: body.phone,
      email: body.email || '',
      weight: body.weight || 0,
      diagnosis: body.diagnosis || '',
      comment: body.comment || '',
      floor_descent: body.floor_descent || 0,
      floor_ascent:  body.floor_ascent  || 0,
      medical_escort: body.medical_escort,
      med_escort_count: body.med_escort_count || 1,
      escort_count: body.escort_count || 0,
      need_oxygen: body.need_oxygen,
      round_trip: body.round_trip
    };
    sendTelegramNotification(notifyData, clientTgChatId).catch(err => console.error('Telegram error:', err.message));
    appendOrderToSheet(notifyData, clientSpreadsheetId).catch(err => console.error('Sheets error:', err.message));
    sendOrderEmails(notifyData).catch(err => console.error('Email send error:', err.message));

    res.json({
      success: true,
      orderNumber: orderNumber,
      order_number: orderNumber,
      price: finalPrice !== undefined ? finalPrice : calculatedPrice,
      bonus_earned: bonusEarned,
      bonus_used: bonusUsed,
      status: 'new'
    });

  } catch (error) {
    console.error('Orders API error:', error.message);
    console.error('SQL error code:', error.code);
    console.error('SQL error detail:', error.sqlMessage || error.sql);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

// DaData suggest endpoint
app.post('/api/dadata/suggest', async (req, res) => {
  try {
    const { query, count = 5 } = req.body;
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Проверяем кэш
    const cacheKey = `suggest_${query.toLowerCase()}`;
    const cached = await getCachedSuggestion(cacheKey);
    if (cached) {
      console.log('📋 Using cached suggestion for:', query);
      return res.json({
        success: true,
        suggestions: cached,
        cached: true
      });
    }

    // Реальный запрос к DaData API
    try {
      const apiKey = process.env.DADATA_API_KEY;
      
      if (!apiKey || apiKey === 'test-api-key') {
        console.log('⚠️ DaData API key not found, using fallback');
        throw new Error('No valid DaData API key');
      }
      
      console.log('🔑 Using DaData API key:', apiKey.substring(0, 10) + '...');
      
      const requestBody = {
        query: query,
        count: count,
        from_bound: req.body.from_bound || { "value": "country" },
        to_bound: req.body.to_bound || { "value": "house" },
        restrict_value: true
      };

      // Каскадный выбор: если передан locations — добавляем фильтр
      if (req.body.locations) {
        requestBody.locations = req.body.locations;
      }

      const requestData = JSON.stringify(requestBody);

      const options = {
        hostname: 'suggestions.dadata.ru',
        port: 443,
        path: '/suggestions/api/4_1/rs/suggest/address',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Token ${apiKey}`,
          'Content-Length': Buffer.byteLength(requestData)
        }
      };

      const dadataResponse = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const jsonData = JSON.parse(data);
              resolve({
                ok: res.statusCode === 200,
                status: res.statusCode,
                data: jsonData
              });
            } catch (error) {
              reject(error);
            }
          });
        });

        req.on('error', reject);
        req.write(requestData);
        req.end();
      });

      if (!dadataResponse.ok) {
        throw new Error(`DaData API error: ${dadataResponse.status}`);
      }

      const dadataData = dadataResponse.data;
      
      if (!dadataData.suggestions || !Array.isArray(dadataData.suggestions)) {
        return res.json({
          success: true,
          suggestions: [],
          cached: false
        });
      }

      // Сохраняем в кэш на 7 дней
      await cacheSuggestion(cacheKey, dadataData.suggestions);
      
      console.log(`🌐 Fetched ${dadataData.suggestions.length} suggestions from DaData for: ${query}`);
      
      res.json({
        success: true,
        suggestions: dadataData.suggestions,
        cached: false
      });

    } catch (error) {
      console.error('❌ DaData API error:', error.message);
      
      // Fallback на mock данные, если DaData недоступен
      console.log('⚠️ Using fallback mock data for:', query);
      
      // Фильтруем mock данные по запросу
      const filteredSuggestions = mockSuggestions
        .filter(suggestion => 
          suggestion.value.toLowerCase().includes(query.toLowerCase()) ||
          suggestion.unrestricted_value.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, count);

      res.json({
        success: true,
        suggestions: filteredSuggestions,
        cached: false,
        fallback: true
      });
    }

  } catch (error) {
    console.error('❌ Suggest API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DaData clean endpoint (автоисправление адресов)
app.post('/api/dadata/clean', async (req, res) => {
  try {
    const { address } = req.body;
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    if (!address) {
      return res.status(400).json({ error: 'Address parameter is required' });
    }

    const dadataApiKey = process.env.DADATA_API_KEY;
    
    if (!dadataApiKey || dadataApiKey === 'test-api-key') {
      console.log('⚠️ DaData API key not found for clean endpoint');
      return res.json({
        success: true,
        result: address,
        fallback: true
      });
    }

    const requestData = JSON.stringify([address]);

    const options = {
      hostname: 'cleaner.dadata.ru',
      port: 443,
      path: '/api/v1/clean/address',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Token ${dadataApiKey}`,
        'X-Secret': process.env.DADATA_SECRET_KEY || dadataApiKey,
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const dadataResponse = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse DaData response'));
          }
        });
      });
      req.on('error', reject);
      req.write(requestData);
      req.end();
    });

    const cleaned = dadataResponse && dadataResponse[0];
    
    if (!cleaned || !cleaned.result) {
      console.log(`⚠️ Clean API returned empty result for: "${address}"`);
      return res.json({
        success: true,
        result: address,
        fallback: true
      });
    }
    
    console.log(`🧹 Cleaned address: "${address}" → "${cleaned.result}"`);
    
    res.json({
      success: true,
      result: cleaned.result,
      geo_lat: cleaned.geo_lat,
      geo_lon: cleaned.geo_lon,
      qc: cleaned.qc
    });

  } catch (error) {
    console.error('Error in clean endpoint:', error);
    res.json({
      success: true,
      result: req.body.address,
      fallback: true
    });
  }
});

// Mock данные для fallback
const mockSuggestions = [
  // Москва
  {
    value: "г Москва, ул Тверская, д 1",
    unrestricted_value: "г Москва, ул Тверская, д 1",
    data: {
      postal_code: "125009",
      city: "г Москва",
      street: "ул Тверская",
      house: "1",
      geo_lat: "55.756",
      geo_lon: "37.617"
    }
  },
  {
    value: "г Москва, ул Тверская, д 2",
    unrestricted_value: "г Москва, ул Тверская, д 2",
    data: {
      postal_code: "125009",
      city: "г Москва",
      street: "ул Тверская",
      house: "2",
      geo_lat: "55.756",
      geo_lon: "37.618"
    }
  },
  {
    value: "г Москва, ул Ленина, д 15",
    unrestricted_value: "г Москва, ул Ленина, д 15",
    data: {
      postal_code: "119048",
      city: "г Москва",
      street: "ул Ленина",
      house: "15",
      geo_lat: "55.749",
      geo_lon: "37.625"
    }
  },
  // Санкт-Петербург
  {
    value: "г Санкт-Петербург, ул Невский, д 1",
    unrestricted_value: "г Санкт-Петербург, ул Невский, д 1",
    data: {
      postal_code: "191011",
      city: "г Санкт-Петербург",
      street: "ул Невский",
      house: "1",
      geo_lat: "59.934",
      geo_lon: "30.335"
    }
  },
  {
    value: "г Санкт-Петербург, пр Невский, д 25",
    unrestricted_value: "г Санкт-Петербург, пр Невский, д 25",
    data: {
      postal_code: "191011",
      city: "г Санкт-Петербург",
      street: "пр Невский",
      house: "25",
      geo_lat: "59.934",
      geo_lon: "30.337"
    }
  },
  // Другие города
  {
    value: "г Екатеринбург, пр Ленина, д 15",
    unrestricted_value: "г Екатеринбург, пр Ленина, д 15",
    data: {
      postal_code: "620000",
      city: "г Екатеринбург",
      street: "пр Ленина",
      house: "15",
      geo_lat: "56.838",
      geo_lon: "60.606"
    }
  },
  {
    value: "г Новосибирск, пр Мира, д 10",
    unrestricted_value: "г Новосибирск, пр Мира, д 10",
    data: {
      postal_code: "630000",
      city: "г Новосибирск",
      street: "пр Мира",
      house: "10",
      geo_lat: "55.030",
      geo_lon: "82.921"
    }
  },
  {
    value: "г Казань, ул Баумана, д 1",
    unrestricted_value: "г Казань, ул Баумана, д 1",
    data: {
      postal_code: "420000",
      city: "г Казань",
      street: "ул Баумана",
      house: "1",
      geo_lat: "55.796",
      geo_lon: "49.106"
    }
  },
  {
    value: "г Нижний Новгород, пр Горького, д 10",
    unrestricted_value: "г Нижний Новгород, пр Горького, д 10",
    data: {
      postal_code: "603000",
      city: "г Нижний Новгород",
      street: "пр Горького",
      house: "10",
      geo_lat: "56.326",
      geo_lon: "44.008"
    }
  }
];

// Функции для работы с кэшем
async function getCachedSuggestion(key) {
  try {
    if (!pool) return null;
    
    const result = await pool.query(
      'SELECT data FROM address_cache WHERE cache_key = $1 AND expires_at > NOW()',
      [key]
    );
    
    if (result.rows.length > 0) {
      return JSON.parse(result.rows[0].data);
    }
    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

async function cacheSuggestion(key, suggestions) {
  try {
    if (!pool) return;
    
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 дней
    await pool.query(
      'INSERT INTO address_cache (cache_key, data, expires_at) VALUES ($1, $2, $3) ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at',
      [key, JSON.stringify(suggestions), expiresAt]
    );
    
    console.log('💾 Cached suggestion for:', key, 'expires in 7 days');
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

// ── Вспомогательная функция: HTTP GET с таймаутом ─────
function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// Distance calculation endpoint (GraphHopper -> OSRM -> Haversine)
// Маршрут: База → Откуда → Куда → База
// Принимает: { from: {lat,lon}, to: {lat,lon} }
//        ИЛИ: { from_lat, from_lon, to_lat, to_lon }  (плоский формат от виджета)
app.post('/api/dadata/distance', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Поддержка обоих форматов: объект {lat,lon} и плоские поля from_lat/from_lon
    let from = req.body.from;
    let to   = req.body.to;

    if (!from && req.body.from_lat && req.body.from_lon) {
      from = { lat: parseFloat(req.body.from_lat), lon: parseFloat(req.body.from_lon) };
    }
    if (!to && req.body.to_lat && req.body.to_lon) {
      to = { lat: parseFloat(req.body.to_lat), lon: parseFloat(req.body.to_lon) };
    }

    if (!from || !to || !from.lat || !from.lon || !to.lat || !to.lon) {
      return res.status(400).json({ error: 'From and to coordinates are required' });
    }

    // Координаты базы из настроек компании
    const baseCoords = companyCache.base_coords || '55.5667,38.2000';
    const [baseLat, baseLon] = baseCoords.split(',').map(Number);
    const base = { lat: baseLat, lon: baseLon };

    console.log(`🗺️  Route: База(${base.lat},${base.lon}) → Откуда(${from.lat},${from.lon}) → Куда(${to.lat},${to.lon}) → База`);

    // Вспомогательная функция: получить расстояние между двумя точками через API
    async function getSegmentDistance(pointA, pointB, provider) {
      if (provider === 'graphhopper') {
        const graphhopperKey = process.env.GRAPHHOPPER_API_KEY || 'a28d42ae-9850-4677-ac6f-edc7fa4ebd0b';
        const ghUrl = `https://graphhopper.com/api/1/route?point=${pointA.lat},${pointA.lon}&point=${pointB.lat},${pointB.lon}&vehicle=car&locale=ru&key=${graphhopperKey}`;
        const ghResp = await httpGet(ghUrl);
        if (ghResp.status === 200 && ghResp.data.paths && ghResp.data.paths.length > 0) {
          return ghResp.data.paths[0].distance / 1000;
        }
        throw new Error(`GraphHopper: ${ghResp.data.message || 'No routes found'}`);
      }
      if (provider === 'osrm') {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${pointA.lon},${pointA.lat};${pointB.lon},${pointB.lat}?overview=false`;
        const osrmResp = await httpGet(osrmUrl);
        if (osrmResp.status === 200 && osrmResp.data.code === 'Ok') {
          return osrmResp.data.routes[0].distance / 1000;
        }
        throw new Error(`OSRM: ${osrmResp.data.code}`);
      }
      // haversine
      return calculateDistance(pointA.lat, pointA.lon, pointB.lat, pointB.lon);
    }

    // Три сегмента маршрута: База→Откуда, Откуда→Куда, Куда→База
    const segments = [
      { from: base, to: from,  label: 'База→Откуда' },
      { from: from, to: to,    label: 'Откуда→Куда' },
      { from: to,   to: base,  label: 'Куда→База'   },
    ];

    // ── Приоритет 1: GraphHopper (все три сегмента сразу через multi-point) ──
    try {
      const graphhopperKey = process.env.GRAPHHOPPER_API_KEY || 'a28d42ae-9850-4677-ac6f-edc7fa4ebd0b';
      const ghUrl = `https://graphhopper.com/api/1/route?point=${base.lat},${base.lon}&point=${from.lat},${from.lon}&point=${to.lat},${to.lon}&point=${base.lat},${base.lon}&vehicle=car&locale=ru&key=${graphhopperKey}`;
      console.log('🚗 GraphHopper: маршрут из 4 точек (База→Откуда→Куда→База)...');

      const ghResp = await httpGet(ghUrl);

      if (ghResp.status === 200 && ghResp.data.paths && ghResp.data.paths.length > 0) {
        const totalDistanceKm = ghResp.data.paths[0].distance / 1000;
        const durationMinutes = Math.round(ghResp.data.paths[0].time / 1000 / 60);
        // Отдельный запрос А→Б для отображения заказчику
        let displayKm = totalDistanceKm;
        try {
          const ghUrlAB = `https://graphhopper.com/api/1/route?point=${from.lat},${from.lon}&point=${to.lat},${to.lon}&vehicle=car&locale=ru&key=${graphhopperKey}`;
          const ghRespAB = await httpGet(ghUrlAB);
          if (ghRespAB.status === 200 && ghRespAB.data.paths && ghRespAB.data.paths.length > 0) {
            displayKm = ghRespAB.data.paths[0].distance / 1000;
          }
        } catch (_) { /* fallback to total */ }
        console.log(`✅ GraphHopper total: ${totalDistanceKm.toFixed(2)} km (А→Б: ${displayKm.toFixed(2)} km), ${durationMinutes} min`);
        return res.json({
          success: true,
          distance: Math.round(totalDistanceKm * 100) / 100,
          distance_display: Math.round(displayKm * 100) / 100,
          duration: durationMinutes,
          unit: 'km',
          method: 'road',
          provider: 'graphhopper',
          route: 'base→from→to→base'
        });
      } else {
        throw new Error(`GraphHopper: ${ghResp.data.message || 'No routes found'}`);
      }

    } catch (ghError) {
      console.error('❌ GraphHopper error:', ghError.message);
      console.log('⚠️  Trying OSRM fallback...');

      // ── Приоритет 2: OSRM (три сегмента суммируем) ────────────────────────
      try {
        let totalKm = 0;
        for (const seg of segments) {
          const km = await getSegmentDistance(seg.from, seg.to, 'osrm');
          console.log(`  OSRM ${seg.label}: ${km.toFixed(2)} km`);
          totalKm += km;
        }
        // Сегмент А→Б уже посчитан — это второй сегмент (index 1)
        const displayKmOsrm = await getSegmentDistance(from, to, 'osrm').catch(() => totalKm);
        console.log(`✅ OSRM total: ${totalKm.toFixed(2)} km (А→Б: ${displayKmOsrm.toFixed(2)} km)`);
        return res.json({
          success: true,
          distance: Math.round(totalKm * 100) / 100,
          distance_display: Math.round(displayKmOsrm * 100) / 100,
          unit: 'km',
          method: 'road',
          provider: 'osrm',
          route: 'base→from→to→base',
          fallback: true
        });

      } catch (osrmError) {
        console.error('❌ OSRM error:', osrmError.message);
        console.log('⚠️  Using Haversine (straight-line)');

        // ── Приоритет 3: Haversine (три сегмента суммируем) ───────────────
        let totalKm = 0;
        for (const seg of segments) {
          const km = calculateDistance(seg.from.lat, seg.from.lon, seg.to.lat, seg.to.lon);
          console.log(`  Haversine ${seg.label}: ${km.toFixed(2)} km`);
          totalKm += km;
        }
        const displayKmHav = calculateDistance(from.lat, from.lon, to.lat, to.lon);
        console.log(`✅ Haversine total: ${totalKm.toFixed(2)} km (А→Б: ${displayKmHav.toFixed(2)} km)`);
        return res.json({
          success: true,
          distance: Math.round(totalKm * 100) / 100,
          distance_display: Math.round(displayKmHav * 100) / 100,
          unit: 'km',
          method: 'straight-line',
          provider: 'haversine',
          route: 'base→from→to→base',
          fallback: true
        });
      }
    }

  } catch (error) {
    console.error('Distance API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Medical Calculator API is working!',
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
});

// Helper functions

// Расчёт стоимости поездки
// data: { totalDistance, fromCity, toCity, weight, descentFloors, ascentFloors,
//         needOxygen, noEscort, waitingSlots, roundTrip }
function calculatePrice(data) {
  const perKm        = pricingCache.per_km        || 45;
  const baseFixedAdd = pricingCache.base_fixed_add || 0;   // ± фикс. надбавка
  const baseCoeff    = pricingCache.base_coeff     || 0;   // % к итогу (0 = выкл)
  const waitingFee   = pricingCache.waiting_30min  || 500;
  const oxygenFee    = pricingCache.oxygen_fee     || 800;
  const noEscortFee  = pricingCache.no_escort_fee  || 300;
  const rtType       = parseInt(pricingCache.round_trip_type)  || 0; // 0=%, 1=фикс
  const rtValue      = parseFloat(pricingCache.round_trip_value) || 80;

  const dist   = data.totalDistance || 0;
  const weight = parseFloat(data.weight) || 0;

  // --- Стоимость по км с городскими коэффициентами ---
  const toRate   = findCityRate(data.toCity);
  const fromRate = findCityRate(data.fromCity);
  let kmPrice = 0;

  // Фикс применяется только если оба адреса в одном фиксированном городе
  const bothInSameFixedCity = toRate && fromRate &&
    toRate.is_fixed_price && fromRate.is_fixed_price &&
    toRate.city_name === fromRate.city_name;

  console.log(`💰 calcPrice: from="${data.fromCity?.slice(0,30)}" toRate=${toRate?.city_name||'null'} fromRate=${fromRate?.city_name||'null'} bothFixed=${bothInSameFixedCity} dist=${dist} perKm=${perKm}`);

  if (bothInSameFixedCity) {
    kmPrice = parseFloat(toRate.value);
  } else {
    kmPrice = dist * perKm;
    // Коэффициент города применяем если один из адресов в городе с коэффициентом
    const applicableRate = (toRate && !toRate.is_fixed_price ? toRate : null)
                        || (fromRate && !fromRate.is_fixed_price ? fromRate : null);
    console.log(`💰 applicableRate=${applicableRate?.city_name||'null'} type=${applicableRate?.rate_type||'null'} val=${applicableRate?.value||'null'}`);
    if (applicableRate && applicableRate.rate_type === 'percent') {
      kmPrice = kmPrice * (1 + parseFloat(applicableRate.value) / 100);
    } else if (applicableRate && applicableRate.rate_type === 'flat_km') {
      kmPrice = dist * (perKm + parseFloat(applicableRate.value));
    }
  }

  let price = kmPrice;

  // --- Спуск без лифта ---
  if (data.descentFloors > 0) {
    price += data.descentFloors * getFloorPrice('descent', weight);
  }

  // --- Подъём без лифта ---
  if (data.ascentFloors > 0) {
    price += data.ascentFloors * getFloorPrice('ascent', weight);
  }

  // --- Ожидание ---
  if (data.waitingSlots > 0) {
    price += data.waitingSlots * waitingFee;
  }

  // --- Кислород ---
  if (data.needOxygen) {
    price += oxygenFee;
  }

  // --- Без сопровождения ---
  if (data.noEscort) {
    price += noEscortFee;
  }

  // --- Фикс. надбавка (± к итогу до коэфф.) ---
  if (baseFixedAdd !== 0) {
    price += baseFixedAdd;
  }

  // --- Коэффициент % к итогу ---
  if (baseCoeff !== 0) {
    price = price * (1 + baseCoeff / 100);
  }

  // --- Туда-обратно ---
  if (data.roundTrip) {
    if (rtType === 1) {
      // Фикс. сумма: прибавляем/вычитаем
      price += rtValue;
    } else {
      // Коэфф. %: rtValue=80 означает +80% (итого ×1.8), rtValue=-20 = скидка 20%
      price = price * (1 + rtValue / 100);
    }
  }

  return Math.round(price);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в километрах
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
}

// Orders list endpoint (для Admin Dashboard)
app.get('/api/orders', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || null;
    const phone  = req.query.phone  || null;

    const conditions = [];
    const params = [];
    if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }
    if (phone)  { params.push(phone);  conditions.push(`o.phone = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const ordersRes = await pool.query(`
      SELECT o.*, c.company_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const countRes = await pool.query(
      `SELECT COUNT(*) as total FROM orders o ${where}`,
      params
    );
    const rows = ordersRes.rows;
    const total = parseInt(countRes.rows[0].total);

    res.json({ orders: rows, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status
app.patch('/api/orders/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const { status } = req.body;
    const allowed = ['new', 'in_progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Публичный endpoint для виджета — без API-ключа
app.get('/api/pricing/public', async (req, res) => {
  try {
    res.json({
      per_km:           pricingCache.per_km           || 45,
      base_fixed_add:   pricingCache.base_fixed_add   || 0,
      base_coeff:       pricingCache.base_coeff       || 0,
      waiting_30min:    pricingCache.waiting_30min     || 500,
      oxygen_fee:       pricingCache.oxygen_fee        || 800,
      no_escort_fee:    pricingCache.no_escort_fee     || 300,
      round_trip_type:  pricingCache.round_trip_type   || 0,
      round_trip_value: pricingCache.round_trip_value  || 80,
      floor_tiers:      floorTiersCache,
      city_rates:       cityRatesCache,
      company:          companyCache,
      bonus: {
        enabled: !!pricingCache.loyalty_enabled,
        percent: pricingCache.loyalty_percent || 5
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pricing endpoints
app.get('/api/pricing', async (req, res) => {
  try {
    if (pool) {
      const result = await pool.query('SELECT key, value, label, updated_at FROM pricing_settings ORDER BY key');
      return res.json({ pricing: result.rows, cache: pricingCache });
    }
    res.json({ pricing: [], cache: pricingCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pricing', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const updates = req.body;
    const allowed = ['per_km', 'base_fixed_add', 'base_coeff', 'waiting_30min', 'oxygen_fee', 'no_escort_fee', 'round_trip_type', 'round_trip_value'];

    const allowNegative = new Set(['base_fixed_add', 'base_coeff', 'round_trip_value']);
    for (const [key, value] of Object.entries(updates)) {
      if (!allowed.includes(key)) continue;
      const num = parseFloat(value);
      if (isNaN(num)) return res.status(400).json({ error: `Invalid value for ${key}` });
      if (!allowNegative.has(key) && num < 0) return res.status(400).json({ error: `${key} cannot be negative` });
      await pool.query('INSERT INTO pricing_settings (key, value, label) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2', [key, num, key]);
      pricingCache[key] = num;
    }

    res.json({ success: true, pricing: pricingCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Company settings
app.get('/api/company', async (req, res) => {
  try {
    res.json({ settings: companyCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/company', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const allowed = ['base_address', 'base_coords', 'policy_url', 'agreement_url'];
    for (const [key, value] of Object.entries(req.body)) {
      if (!allowed.includes(key)) continue;
      await pool.query('INSERT INTO company_settings (key, value, label) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2', [key, value, key]);
      companyCache[key] = value;
    }
    res.json({ success: true, settings: companyCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Floor tiers
app.get('/api/pricing/floor-tiers', async (req, res) => {
  try {
    res.json({ tiers: floorTiersCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pricing/floor-tiers', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const { tiers } = req.body; // [{direction, weight_from, weight_to, price_per_floor}]
    if (!Array.isArray(tiers)) return res.status(400).json({ error: 'tiers must be array' });

    await pool.query('DELETE FROM pricing_floor_tiers');
    for (const t of tiers) {
      await pool.query(
        'INSERT INTO pricing_floor_tiers (direction, weight_from, weight_to, price_per_floor) VALUES ($1,$2,$3,$4)',
        [t.direction, t.weight_from, t.weight_to || null, t.price_per_floor]
      );
    }
    const tiersRes = await pool.query('SELECT * FROM pricing_floor_tiers ORDER BY direction, weight_from');
    floorTiersCache.descent = tiersRes.rows.filter(r => r.direction === 'descent');
    floorTiersCache.ascent  = tiersRes.rows.filter(r => r.direction === 'ascent');
    res.json({ success: true, tiers: floorTiersCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// City rates
app.get('/api/pricing/city-rates', async (req, res) => {
  try {
    res.json({ rates: cityRatesCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pricing/city-rates', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const { city_name, rate_type, value, is_fixed_price, note } = req.body;
    if (!city_name) return res.status(400).json({ error: 'city_name required' });
    const insertRes = await pool.query(
      'INSERT INTO pricing_city_rates (city_name, rate_type, value, is_fixed_price, note) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [city_name, rate_type || 'percent', parseFloat(value) || 0, is_fixed_price ? true : false, note || '']
    );
    const ratesRes = await pool.query('SELECT * FROM pricing_city_rates ORDER BY city_name');
    cityRatesCache = ratesRes.rows;
    res.json({ success: true, id: insertRes.rows[0].id, rates: cityRatesCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pricing/city-rates/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const { city_name, rate_type, value, is_fixed_price, note } = req.body;
    await pool.query(
      'UPDATE pricing_city_rates SET city_name=$1, rate_type=$2, value=$3, is_fixed_price=$4, note=$5 WHERE id=$6',
      [city_name, rate_type, parseFloat(value), is_fixed_price ? true : false, note || '', req.params.id]
    );
    const ratesRes = await pool.query('SELECT * FROM pricing_city_rates ORDER BY city_name');
    cityRatesCache = ratesRes.rows;
    res.json({ success: true, rates: cityRatesCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pricing/city-rates/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    await pool.query('DELETE FROM pricing_city_rates WHERE id=$1', [req.params.id]);
    const ratesRes = await pool.query('SELECT * FROM pricing_city_rates ORDER BY city_name');
    cityRatesCache = ratesRes.rows;
    res.json({ success: true, rates: cityRatesCache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Telegram test endpoint
app.get('/api/telegram/test', async (req, res) => {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env.local' });
  }
  try {
    await sendTelegramNotification({
      orderNumber: 'TEST-001',
      customer_name: 'Тест',
      phone: '+7 (999) 000-00-00',
      email: 'test@example.com',
      from_address: 'Раменское, Махова, 14',
      to_address: 'Москва, Красная площадь, 1',
      distance: 42,
      price: 3500,
      weight: 75,
      diagnosis: 'Тест',
      comment: 'Тестовое уведомление',
      floor_descent: 2,
      floor_ascent: 0,
      medical_escort: false,
      need_oxygen: false,
      round_trip: false,
    });
    res.json({ success: true, chat_id: chatId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google Sheets test endpoint
app.get('/api/sheets/test', async (req, res) => {
  if (!sheetsClient) {
    return res.status(500).json({ error: 'Google Sheets not initialized. Check GOOGLE_SERVICE_ACCOUNT_KEY_FILE and GOOGLE_SPREADSHEET_ID in .env.local' });
  }
  try {
    await appendOrderToSheet({
      orderNumber: 'TEST-001',
      customer_name: 'Тест',
      phone: '+7 (999) 000-00-00',
      email: 'test@example.com',
      from_address: 'Раменское, Махова, 14',
      to_address: 'Москва, Красная площадь, 1',
      distance: 42,
      price: 3500,
      weight: 75,
      diagnosis: 'Тест',
      floor_descent: 2,
      floor_ascent: 0,
      medical_escort: false,
      need_oxygen: false,
      round_trip: false,
      comment: 'Тестовая запись',
    });
    res.json({ success: true, spreadsheet_id: process.env.GOOGLE_SPREADSHEET_ID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── INTEGRATIONS API ──────────────────────────────────
// GET /api/integrations — возвращает настройки интеграций клиента + мета-данные бота
app.get('/api/integrations', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const clientsRes = await pool.query(
      'SELECT telegram_chat_id, google_spreadsheet_id FROM clients WHERE api_key = $1', [apiKey]
    );
    if (clientsRes.rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });
    const client = clientsRes.rows[0];

    // Получаем username бота для отображения в UI
    let bot_username = null;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      try {
        const me = await telegramRequest(token, 'getMe', {});
        if (me.ok) bot_username = me.result.username;
      } catch (_) {}
    }

    // Email сервисного аккаунта Google
    let sheets_service_email = null;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
      try {
        const keyData = JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, 'utf8'));
        sheets_service_email = keyData.client_email || null;
      } catch (_) {}
    }

    res.json({
      telegram_chat_id:      client.telegram_chat_id      || null,
      google_spreadsheet_id: client.google_spreadsheet_id || null,
      bot_username,
      sheets_service_email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/integrations — сохраняет настройки интеграций клиента
app.put('/api/integrations', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const allowed = ['telegram_chat_id', 'google_spreadsheet_id'];
    const updates = [];
    const values  = [];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        values.push(req.body[key] === null ? null : String(req.body[key] || ''));
        updates.push(`${key} = $${values.length}`);
      }
    }
    if (updates.length === 0) return res.json({ success: true });
    values.push(apiKey);
    await pool.query(`UPDATE clients SET ${updates.join(', ')} WHERE api_key = $${values.length}`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/telegram/test-client — тест Telegram для текущего клиента
app.get('/api/telegram/test-client', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const clientsRes = await pool.query('SELECT telegram_chat_id FROM clients WHERE api_key = $1', [apiKey]);
    if (clientsRes.rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });
    const chatId = clientsRes.rows[0].telegram_chat_id;
    if (!chatId) return res.status(400).json({ error: 'Telegram не подключён. Отправьте боту /start ' + apiKey });
    await sendTelegramNotification({
      orderNumber: 'TEST-001', customer_name: 'Тест',
      phone: '+7 (999) 000-00-00', email: 'test@example.com',
      from_address: 'Раменское, Махова, 14', to_address: 'Москва, Красная площадь, 1',
      distance: 42, price: 3500, weight: 75, diagnosis: 'Тест',
      comment: 'Тестовое уведомление из Admin Panel',
      floor_descent: 0, floor_ascent: 0, medical_escort: false, need_oxygen: false, round_trip: false,
    }, chatId);
    res.json({ success: true, chat_id: chatId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sheets/test-client — тест Google Sheets для текущего клиента
app.get('/api/sheets/test-client', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  if (!sheetsClient) return res.status(500).json({ error: 'Google Sheets не настроен на сервере' });
  try {
    const clientsRes = await pool.query('SELECT google_spreadsheet_id FROM clients WHERE api_key = $1', [apiKey]);
    if (clientsRes.rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });
    const spreadsheetId = clientsRes.rows[0].google_spreadsheet_id;
    if (!spreadsheetId) return res.status(400).json({ error: 'ID таблицы не указан. Введите его в настройках.' });
    await appendOrderToSheet({
      orderNumber: 'TEST-001', customer_name: 'Тест',
      phone: '+7 (999) 000-00-00', email: 'test@example.com',
      from_address: 'Раменское, Махова, 14', to_address: 'Москва, Красная площадь, 1',
      distance: 42, price: 3500, weight: 75, diagnosis: 'Тест',
      floor_descent: 0, floor_ascent: 0, medical_escort: false, need_oxygen: false, round_trip: false,
      comment: 'Тестовая запись из Admin Panel',
    }, spreadsheetId);
    res.json({ success: true, spreadsheet_id: spreadsheetId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Email test endpoint
app.get('/api/email/test', async (req, res) => {
  if (!resendManager) {
    return res.status(500).json({ error: 'Resend not initialized. Check RESEND_API_KEY in .env.local' });
  }
  const managerEmail = process.env.MANAGER_EMAIL || 'alexeyschulmin@gmail.com';
  try {
    const { data, error } = await resendManager.emails.send({
      from: 'Медицинский калькулятор <onboarding@resend.dev>',
      to: [managerEmail],
      subject: '✅ Тест email — Medical Calculator',
      html: '<h2>Тест работает!</h2><p>Email уведомления настроены корректно.</p>'
    });
    if (error) {
      console.error('❌ Test email error:', JSON.stringify(error));
      return res.status(500).json({ error });
    }
    console.log(`✅ Test email sent, id: ${data.id}`);
    res.json({ success: true, id: data.id, to: managerEmail });
  } catch (err) {
    console.error('❌ Test email exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── LOYALTY: получить баланс бонусов по телефону ───────────────────────────
app.get('/api/loyalty/balance', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (!pool) return res.json({ phone, bonus_balance: 0, total_orders: 0 });
  try {
    const { rows } = await pool.query(
      'SELECT bonus_balance, total_orders, total_spent FROM customers WHERE phone = $1',
      [normalizePhone(phone)]
    );
    if (rows.length === 0) return res.json({ phone, bonus_balance: 0, total_orders: 0 });
    res.json({ phone, ...rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOYALTY: список клиентов (для админки) ──────────────────────────────────
app.get('/api/loyalty/customers', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  if (!pool) return res.json({ customers: [] });
  try {
    const limit  = parseInt(req.query.limit)  || 50;
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await pool.query(
      'SELECT id, phone, bonus_balance, total_orders, total_spent, created_at FROM customers ORDER BY total_spent DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    const countRes = await pool.query('SELECT COUNT(*) FROM customers');
    res.json({ customers: rows, total: parseInt(countRes.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOYALTY: ручная корректировка баланса ───────────────────────────────────
app.post('/api/loyalty/adjust', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  const { phone, delta } = req.body;
  if (!phone || delta === undefined) return res.status(400).json({ error: 'phone and delta required' });
  if (!pool) return res.status(503).json({ error: 'DB not available' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO customers (phone, bonus_balance)
      VALUES ($1, GREATEST(0, $2))
      ON CONFLICT (phone) DO UPDATE
        SET bonus_balance = GREATEST(0, customers.bonus_balance + $2),
            updated_at = CURRENT_TIMESTAMP
      RETURNING bonus_balance
    `, [normalizePhone(phone), parseInt(delta)]);
    res.json({ phone, bonus_balance: rows[0].bonus_balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOYALTY: настройки (GET) ─────────────────────────────────────────────────
app.get('/api/loyalty/settings', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  res.json({
    loyalty_enabled: pricingCache.loyalty_enabled || 0,
    loyalty_percent: pricingCache.loyalty_percent || 5
  });
});

// ─── LOYALTY: настройки (PUT) ─────────────────────────────────────────────────
app.put('/api/loyalty/settings', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  const { loyalty_enabled, loyalty_percent } = req.body;
  if (!pool) return res.status(503).json({ error: 'DB not available' });
  try {
    const enabled = loyalty_enabled ? 1 : 0;
    const percent = Math.max(0, Math.min(100, parseFloat(loyalty_percent) || 5));
    await pool.query(`INSERT INTO pricing_settings (key, value, label) VALUES ('loyalty_enabled',$1,'Система лояльности') ON CONFLICT (key) DO UPDATE SET value=$1`, [enabled]);
    await pool.query(`INSERT INTO pricing_settings (key, value, label) VALUES ('loyalty_percent',$1,'Процент начисления бонусов') ON CONFLICT (key) DO UPDATE SET value=$1`, [percent]);
    pricingCache.loyalty_enabled = enabled;
    pricingCache.loyalty_percent = percent;
    res.json({ success: true, loyalty_enabled: enabled, loyalty_percent: percent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Medical Calculator API Server running on http://localhost:${PORT}`);
  console.log(`📧 RESEND_API_KEY: ${process.env.RESEND_API_KEY ? 'configured ✅' : 'NOT SET ❌'}`);
  console.log(`📧 MANAGER_EMAIL: ${process.env.MANAGER_EMAIL || 'alexeyschulmin@gmail.com (default)'}`);
  console.log(`🤖 TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? 'configured ✅' : 'NOT SET ❌'}`);
  console.log(`🤖 TELEGRAM_CHAT_ID: ${process.env.TELEGRAM_CHAT_ID || 'NOT SET ❌'}`);
  console.log(`📊 GOOGLE_SPREADSHEET_ID: ${process.env.GOOGLE_SPREADSHEET_ID ? 'configured ✅' : 'NOT SET ❌'}`);
  console.log(`📡 Available endpoints:`);
  console.log(`   GET  /api/test`);
  console.log(`   GET  /api/email/test`);
  console.log(`   GET  /api/telegram/test`);
  console.log(`   GET  /api/sheets/test`);
  console.log(`   GET  /api/pricing`);
  console.log(`   PUT  /api/pricing`);
  console.log(`   GET  /api/widget/config`);
  console.log(`   POST /api/orders`);
  console.log(`   POST /api/dadata/suggest`);
  console.log(`   POST /api/dadata/distance`);
});
