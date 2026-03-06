const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const https = require('https');
const crypto = require('crypto');
const { Resend } = require('resend');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3003', 'https://medical-calculator.pages.dev', 'https://medical-calculator.vercel.app'],
  credentials: true
}));
app.use(express.json());

// Статические файлы
app.use(express.static('public'));

// PostgreSQL connection
let pool;

function normalizeAllowedDomains(domains) {
  if (!Array.isArray(domains)) return [];
  return [...new Set(
    domains
      .map(d => String(d || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

const ALLOWED_PLAN_CODES = new Set(['trial14', 'monthly', 'quarterly', 'yearly']);

function isValidPlanCode(planCode) {
  return ALLOWED_PLAN_CODES.has(String(planCode || '').trim().toLowerCase());
}

function normalizeDomain(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function isValidDomain(domain) {
  const value = normalizeDomain(domain);
  if (!value || value.includes('/')) return false;
  // example.com, sub.example.com
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

function buildDefaultClientSettings(overrides = {}) {
  const pricing = {
    per_km: pricingCache.per_km ?? 45,
    base_fixed_add: pricingCache.base_fixed_add ?? 0,
    base_coeff: pricingCache.base_coeff ?? 0,
    waiting_30min: pricingCache.waiting_30min ?? 500,
    oxygen_fee: pricingCache.oxygen_fee ?? 800,
    no_escort_fee: pricingCache.no_escort_fee ?? 300,
    round_trip_type: pricingCache.round_trip_type ?? 0,
    round_trip_value: pricingCache.round_trip_value ?? 80,
  };

  const company = {
    base_address: companyCache.base_address ?? '',
    base_coords: companyCache.base_coords ?? '',
    policy_url: companyCache.policy_url ?? '',
    agreement_url: companyCache.agreement_url ?? '',
  };

  return {
    pricing,
    company,
    widget_display_mode: 'hybrid',
    calculator_fields: {
      medical_escort: true,
      need_oxygen: true,
      email: true,
      comment: true,
      diagnosis: true,
      escort_count: true,
      round_trip: true,
      trip_date: true,
    },
    floor_tiers: floorTiersCache,
    city_rates: cityRatesCache,
    loyalty: {
      loyalty_enabled: pricingCache.loyalty_enabled ?? 0,
      loyalty_percent: pricingCache.loyalty_percent ?? 5,
      loyalty_max_usage_percent: 100,
    },
    integrations: {
      telegram_chat_id: null,
      google_spreadsheet_id: null,
    },
    ...overrides,
  };
}

async function generateUniqueApiKey() {
  if (!pool) throw new Error('Database not available');
  for (let i = 0; i < 5; i += 1) {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const exists = await pool.query('SELECT 1 FROM clients WHERE api_key = $1 LIMIT 1', [apiKey]);
    if (exists.rows.length === 0) return apiKey;
  }
  throw new Error('Unable to generate unique API key');
}

async function createClientProvision(payload) {
  if (!pool) throw new Error('Database not available');
  const {
    company_name,
    contact_email,
    license_type,
    allowed_domains,
    trial_until,
    paid_until,
    settings,
  } = payload;

  const normalizedDomains = normalizeAllowedDomains(allowed_domains);
  const apiKey = await generateUniqueApiKey();
  const settingsJson = JSON.stringify(settings || buildDefaultClientSettings());

  const result = await pool.query(`
    INSERT INTO clients (
      api_key, license_type, trial_until, paid_until,
      allowed_domains, company_name, contact_email, settings
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    apiKey,
    license_type || 'trial',
    trial_until || null,
    paid_until || null,
    normalizedDomains,
    company_name || null,
    contact_email || null,
    settingsJson,
  ]);

  return result.rows[0];
}

async function sendClientOnboardingEmail(client, plainApiKey) {
  if (!resendManager || !client?.contact_email) return;
  const adminUrl = process.env.ADMIN_PANEL_URL || 'http://localhost:3000/admin';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@example.com';
  const widgetScriptUrl = process.env.WIDGET_SCRIPT_URL || 'http://localhost:3000/widget-calculator.js';
  const allowedDomain = Array.isArray(client.allowed_domains) && client.allowed_domains[0] ? client.allowed_domains[0] : 'your-domain.com';

  const html = `
<h2>Доступ к Medical Calculator активирован</h2>
<p>Компания: <strong>${client.company_name || 'Новый клиент'}</strong></p>
<p>Лицензия: <strong>${client.license_type || 'trial'}</strong></p>
<p><strong>Админ-панель:</strong> <a href="${adminUrl}">${adminUrl}</a></p>
<p><strong>API key:</strong> <code>${plainApiKey}</code></p>
<p><strong>Быстрый скрипт подключения:</strong></p>
<pre style="background:#f8fafc;padding:12px;border-radius:8px;overflow:auto">&lt;script src="${widgetScriptUrl}" data-key="${plainApiKey}" data-domain="${allowedDomain}"&gt;&lt;/script&gt;</pre>
<p>Важно: ограничьте ключ через allowed domains и не публикуйте его вне рабочего сайта.</p>
<p>Поддержка: ${supportEmail}</p>
  `;

  try {
    const { error } = await resendManager.emails.send({
      from: 'Medical Calculator <onboarding@resend.dev>',
      to: [client.contact_email],
      subject: 'Ваш доступ к Medical Calculator',
      html,
    });
    if (error) console.error('❌ Onboarding email error:', JSON.stringify(error));
    else console.log(`✅ Onboarding email sent to ${client.contact_email}`);
  } catch (err) {
    console.error('❌ Onboarding email exception:', err.message);
  }
}

async function upsertOrderInSheet(order, spreadsheetId) {
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Заявки';
  if (!sheetsClient || !spreadsheetId || !order?.orderNumber) return;
  try {
    await ensureSheetHeaders(spreadsheetId, sheetName);
    const existing = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!B2:B`,
    });
    const rows = existing.data.values || [];
    const idx = rows.findIndex((r) => String(r?.[0] || '').trim() === String(order.orderNumber).trim());
    const row = buildSheetOrderRow(order);

    if (idx === -1) {
      await appendOrderToSheet(order, spreadsheetId);
      return;
    }

    const rowNumber = idx + 2;
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowNumber}:S${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    console.log(`✅ Order updated in Google Sheets (${spreadsheetId}), row=${rowNumber}`);
  } catch (err) {
    console.error('❌ Google Sheets upsert error:', err.message);
  }
}

function resolveLicenseDatesByPlan(planCode) {
  const now = new Date();
  const plans = {
    trial14: { license_type: 'trial', trial_days: 14 },
    monthly: { license_type: 'paid', paid_days: 30 },
    quarterly: { license_type: 'paid', paid_days: 90 },
    yearly: { license_type: 'paid', paid_days: 365 },
  };
  const selected = plans[planCode] || plans.monthly;
  if (selected.license_type === 'trial') {
    const trialUntil = new Date(now);
    trialUntil.setDate(trialUntil.getDate() + selected.trial_days);
    return { license_type: 'trial', trial_until: trialUntil.toISOString(), paid_until: null };
  }
  const paidUntil = new Date(now);
  paidUntil.setDate(paidUntil.getDate() + selected.paid_days);
  return { license_type: 'paid', trial_until: null, paid_until: paidUntil.toISOString() };
}

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

    // Таблица заявок на подключение (pre-checkout + post-payment activation)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signup_requests (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(200),
        contact_email VARCHAR(200) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        plan_code VARCHAR(50) NOT NULL,
        payment_provider VARCHAR(50),
        payment_id VARCHAR(200),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','provisioned','failed')),
        license_type VARCHAR(20),
        trial_until TIMESTAMP NULL,
        paid_until TIMESTAMP NULL,
        client_id INT NULL REFERENCES clients(id),
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS signup_requests_payment_uniq ON signup_requests(payment_provider, payment_id) WHERE payment_id IS NOT NULL`);

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
        client_id INT REFERENCES clients(id),
        phone VARCHAR(50) NOT NULL,
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
      await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS client_id INT REFERENCES clients(id)`);
      await pool.query(`DROP INDEX IF EXISTS customers_phone_key`);
      await pool.query(`ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS customers_client_phone_uniq ON customers (client_id, phone)`);
    } catch { /* игнорируем */ }

    // Миграция orders: добавляем колонки для бонусов
    try {
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_earned INT DEFAULT 0`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_used INT DEFAULT 0`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_applied BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_applied_at TIMESTAMP NULL`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS escort_count INT DEFAULT 1`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS floor_descent INT DEFAULT 0`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS floor_ascent INT DEFAULT 0`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS need_oxygen BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20)`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS trip_datetime TIMESTAMP NULL`);
    } catch { /* игнорируем */ }

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
      // Шаг 2: объединяем дубликаты в рамках одного клиента
      // Важно: нельзя объединять одинаковые телефоны между разными client_id
      await pool.query(`
        WITH dupes AS (
          SELECT COALESCE(client_id, -1) AS grp_client_id,
                 phone,
                 SUM(bonus_balance) AS total_bonus,
                 SUM(total_orders)  AS total_ord,
                 SUM(total_spent)   AS total_sp,
                 MIN(created_at)    AS first_seen,
                 MIN(id)            AS keep_id
          FROM customers
          GROUP BY COALESCE(client_id, -1), phone
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
          SELECT MIN(id) FROM customers GROUP BY COALESCE(client_id, -1), phone
        )
      `);

      // Шаг 3: backfill client_id для старых строк customers (где он NULL),
      // если телефон встречается только у одного клиента в orders
      await pool.query(`
        UPDATE customers c
        SET client_id = m.client_id
        FROM (
          SELECT phone, MIN(client_id) AS client_id
          FROM orders
          WHERE client_id IS NOT NULL
          GROUP BY phone
          HAVING COUNT(DISTINCT client_id) = 1
        ) m
        WHERE c.client_id IS NULL AND c.phone = m.phone
      `);

      // Шаг 4: гарантируем наличие customers по каждой паре (client_id, phone),
      // чтобы исторические данные лояльности не "пропадали" после перехода на tenant-изоляцию
      await pool.query(`
        INSERT INTO customers (client_id, phone, bonus_balance, total_orders, total_spent, created_at, updated_at)
        SELECT
          o.client_id,
          o.phone,
          0,
          COUNT(*)::INT,
          COALESCE(SUM(o.price), 0)::DECIMAL(12,2),
          MIN(o.created_at),
          CURRENT_TIMESTAMP
        FROM orders o
        WHERE o.client_id IS NOT NULL AND o.phone IS NOT NULL AND o.phone <> ''
        GROUP BY o.client_id, o.phone
        ON CONFLICT (client_id, phone) DO UPDATE
          SET total_orders = GREATEST(customers.total_orders, EXCLUDED.total_orders),
              total_spent  = GREATEST(customers.total_spent, EXCLUDED.total_spent),
              updated_at   = CURRENT_TIMESTAMP
      `);

      const unresolvedRes = await pool.query(`SELECT COUNT(*)::INT AS cnt FROM customers WHERE client_id IS NULL`);
      const unresolved = unresolvedRes.rows[0]?.cnt || 0;
      console.log('✅ Миграция customers: телефоны нормализованы, дубликаты объединены');
      if (unresolved > 0) {
        console.warn(`⚠️  customers без client_id после backfill: ${unresolved} (требуется ручная проверка)`);
      }
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
initializeDatabase()
  .then(() => {
    console.log('✅ Database initialized, setting up superadmin tables...');
    return ensureSuperAdminTables();
  })
  .catch(console.error);

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
function getFloorPrice(direction, weight, floorTiers = floorTiersCache) {
  const tiers = floorTiers[direction] || [];
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
function findCityRate(cityName, rates = cityRatesCache) {
  if (!cityName) return null;
  const name = cityName.toLowerCase();
  return rates.find(c => name.includes(c.city_name.toLowerCase())) || null;
}

function parseClientSettings(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function buildClientScopedConfig(client) {
  const settings = parseClientSettings(client?.settings);
  return {
    pricing: {
      per_km: settings.pricing?.per_km ?? pricingCache.per_km ?? 45,
      base_fixed_add: settings.pricing?.base_fixed_add ?? pricingCache.base_fixed_add ?? 0,
      base_coeff: settings.pricing?.base_coeff ?? pricingCache.base_coeff ?? 0,
      waiting_30min: settings.pricing?.waiting_30min ?? pricingCache.waiting_30min ?? 500,
      oxygen_fee: settings.pricing?.oxygen_fee ?? pricingCache.oxygen_fee ?? 800,
      no_escort_fee: settings.pricing?.no_escort_fee ?? pricingCache.no_escort_fee ?? 300,
      round_trip_type: settings.pricing?.round_trip_type ?? pricingCache.round_trip_type ?? 0,
      round_trip_value: settings.pricing?.round_trip_value ?? pricingCache.round_trip_value ?? 80,
    },
    company: {
      base_address: settings.company?.base_address ?? companyCache.base_address ?? '',
      base_coords: settings.company?.base_coords ?? companyCache.base_coords ?? '',
      policy_url: settings.company?.policy_url ?? companyCache.policy_url ?? '',
      agreement_url: settings.company?.agreement_url ?? companyCache.agreement_url ?? '',
    },
    floor_tiers: settings.floor_tiers || floorTiersCache,
    city_rates: settings.city_rates || cityRatesCache,
    loyalty: {
      loyalty_enabled: settings.loyalty?.loyalty_enabled ?? pricingCache.loyalty_enabled ?? 0,
      loyalty_percent: settings.loyalty?.loyalty_percent ?? pricingCache.loyalty_percent ?? 5,
      loyalty_max_usage_percent: settings.loyalty?.loyalty_max_usage_percent ?? 100,
    },
    raw: settings,
  };
}

async function saveClientScopedSettings(clientId, updater) {
  const currentRes = await pool.query('SELECT settings FROM clients WHERE id = $1 LIMIT 1', [clientId]);
  if (currentRes.rows.length === 0) return null;
  const current = parseClientSettings(currentRes.rows[0].settings);
  const next = updater(current) || current;
  await pool.query('UPDATE clients SET settings = $1 WHERE id = $2', [JSON.stringify(next), clientId]);
  return next;
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
    order.trip_datetime ? `🗓 *Дата поездки*: ${new Date(order.trip_datetime).toLocaleString('ru-RU')}` : null,
    order.distance ? `🛣 *Расстояние*: ${order.distance} км` : null,
    ``,
    `💰 *Стоимость: ${Number(order.price).toLocaleString('ru-RU')} ₽*${order.bonus_used > 0 ? ` _(списано ${order.bonus_used} бонусов)_` : ''}`,
    order.weight ? `⚖️ *Вес*: ${order.weight} кг` : null,
    order.diagnosis ? `🏥 *Диагноз*: ${order.diagnosis}` : null,
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

function statusToRuLabel(status) {
  return {
    new: 'Новая',
    in_progress: 'В работе',
    completed: 'Завершена',
    cancelled: 'Отменена',
  }[String(status || 'new')] || 'Новая';
}

function formatTripDateTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function formatPriceRub(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

function toSheetSafeText(value) {
  const str = String(value ?? '');
  if (!str) return '';
  // Avoid spreadsheet formula parsing for values like +7...
  if (str.startsWith('+')) return `'${str}`;
  return str;
}

async function ensureSheetHeaders(spreadsheetId, sheetName) {
  const headers = [
    'Дата', 'Номер заявки', 'Телефон', 'Email', 'Имя клиента', 'Откуда', 'Куда',
    'Расстояние (км)', 'Стоимость', 'Вес', 'Диагноз', 'Спуск (этажей)',
    'Подъем (этажей)', 'Мед. сопровождение', 'Кислород', 'Туда-обратно',
    'Комментарий', 'Статус', 'Дата/время поездки'
  ];

  const headerRes = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:S1`,
  });
  const firstRow = headerRes.data.values && headerRes.data.values[0] ? headerRes.data.values[0] : [];
  const hasExpectedHeader = firstRow[0] === headers[0] && firstRow[1] === headers[1];

  if (!firstRow.length) {
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:S1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });
    return;
  }

  if (!hasExpectedHeader) {
    const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
    const targetSheet = (meta.data.sheets || []).find((s) => s.properties && s.properties.title === sheetName);
    const sheetId = targetSheet?.properties?.sheetId;
    if (sheetId !== undefined && sheetId !== null) {
      await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            insertDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: 0,
                endIndex: 1,
              },
              inheritFromBefore: false,
            },
          }],
        },
      });
    }
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:S1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });
  }
}

function buildSheetOrderRow(order) {
  return [
    new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
    order.orderNumber || '',
    toSheetSafeText(order.phone || ''),
    order.email || '',
    order.customer_name || '',
    order.from_address || '',
    order.to_address || '',
    order.distance || 0,
    order.price || 0,
    order.weight || '',
    order.diagnosis || '',
    order.floor_descent || 0,
    order.floor_ascent || 0,
    order.medical_escort ? 'Да' : 'Нет',
    order.need_oxygen ? 'Да' : 'Нет',
    order.round_trip ? 'Да' : 'Нет',
    order.comment || '',
    statusToRuLabel(order.status),
    formatTripDateTime(order.trip_datetime),
  ];
}

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
    await ensureSheetHeaders(spreadsheetId, sheetName);

    const row = buildSheetOrderRow(order);
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
    ? `<tr><td style="padding:6px 12px;background:#fef9c3;font-weight:600">⭐ Оплачено бонусами</td><td style="padding:6px 12px;color:#854d0e"><strong>${formatPriceRub(order.bonus_used)} ₽</strong> (из ${formatPriceRub(order.original_price)} ₽)</td></tr>`
    : '';

  // Письмо менеджеру
  const managerHtml = `
<h2>Новая заявка ${order.orderNumber}</h2>
<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Откуда</td><td style="padding:6px 12px">${order.from_address}</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Куда</td><td style="padding:6px 12px">${order.to_address}</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Расстояние</td><td style="padding:6px 12px">${order.distance} км</td></tr>
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Стоимость к оплате</td><td style="padding:6px 12px"><strong>${formatPriceRub(order.price)} ₽</strong></td></tr>
  ${order.trip_datetime ? `<tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Дата/время поездки</td><td style="padding:6px 12px">${formatTripDateTime(order.trip_datetime)}</td></tr>` : ''}
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
  <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Стоимость к оплате</td><td style="padding:6px 12px"><strong>${formatPriceRub(order.price)} ₽</strong></td></tr>
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
            percent: pricingCache.loyalty_percent,
            max_usage_percent: 100,
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
        percent: pricingCache.loyalty_percent || 5,
        max_usage_percent: 100,
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

    const loyaltySettings = settings.loyalty || {};
    settings.bonus = {
      ...(settings.bonus || {}),
      enabled: !!loyaltySettings.loyalty_enabled,
      percent: parseFloat(loyaltySettings.loyalty_percent ?? settings.bonus?.percent ?? 5) || 5,
      max_usage_percent: Math.max(0, Math.min(100, parseFloat(loyaltySettings.loyalty_max_usage_percent ?? settings.bonus?.max_usage_percent ?? 100) || 100)),
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

// Публичный pre-checkout endpoint: сохраняем заявку до оплаты
app.post('/api/public/signup-intent', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });

    const { company_name, email, domain, plan_code, metadata } = req.body || {};
    if (!email || !domain || !plan_code) {
      return res.status(400).json({ error: 'email, domain, plan_code are required' });
    }

    const normalizedDomain = normalizeDomain(domain);
    const normalizedPlan = String(plan_code).trim().toLowerCase();
    if (!isValidDomain(normalizedDomain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }
    if (!isValidPlanCode(normalizedPlan)) {
      return res.status(400).json({ error: 'Invalid plan_code' });
    }

    const result = await pool.query(`
      INSERT INTO signup_requests (company_name, contact_email, domain, plan_code, metadata, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, status, created_at
    `, [
      company_name || null,
      String(email).trim().toLowerCase(),
      normalizedDomain,
      normalizedPlan,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    res.json({
      signup_request_id: result.rows[0].id,
      status: result.rows[0].status,
      created_at: result.rows[0].created_at,
    });
  } catch (error) {
    console.error('Error creating signup intent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Публичный webhook от платежки: после успешной оплаты создаем клиента и отправляем доступ
app.post('/api/public/payment-webhook', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });

    const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    const providedSecret = req.headers['x-payment-secret'];
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    const {
      signup_request_id,
      payment_provider,
      payment_id,
      payment_status,
    } = req.body || {};

    if (!signup_request_id || !payment_id) {
      return res.status(400).json({ error: 'signup_request_id and payment_id are required' });
    }
    if (String(payment_status).toLowerCase() !== 'succeeded') {
      return res.status(202).json({ status: 'ignored', reason: 'payment not succeeded' });
    }

    const signupRes = await pool.query(
      'SELECT * FROM signup_requests WHERE id = $1 LIMIT 1',
      [signup_request_id]
    );
    if (signupRes.rows.length === 0) {
      return res.status(404).json({ error: 'Signup request not found' });
    }

    const signup = signupRes.rows[0];
    if (signup.client_id) {
      return res.json({ status: 'already_provisioned', client_id: signup.client_id });
    }

    const normalizedPlan = String(signup.plan_code || '').toLowerCase();
    if (!isValidPlanCode(normalizedPlan)) {
      return res.status(400).json({ error: 'Invalid plan_code in signup request' });
    }

    const licenseDates = resolveLicenseDatesByPlan(normalizedPlan);
    const createdClient = await createClientProvision({
      company_name: signup.company_name,
      contact_email: signup.contact_email,
      license_type: licenseDates.license_type,
      trial_until: licenseDates.trial_until,
      paid_until: licenseDates.paid_until,
      allowed_domains: [signup.domain],
      settings: buildDefaultClientSettings(),
    });

    await pool.query(`
      UPDATE signup_requests
      SET status = 'provisioned',
          payment_provider = $1,
          payment_id = $2,
          license_type = $3,
          trial_until = $4,
          paid_until = $5,
          client_id = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
    `, [
      payment_provider || 'unknown',
      payment_id,
      licenseDates.license_type,
      licenseDates.trial_until,
      licenseDates.paid_until,
      createdClient.id,
      signup_request_id,
    ]);

    await sendClientOnboardingEmail(createdClient, createdClient.api_key);
    res.json({ status: 'provisioned', client_id: createdClient.id });
  } catch (error) {
    console.error('Payment webhook provisioning error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Calculate price endpoint (для предварительного расчёта в виджете)
app.post('/api/calculate-price', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const scopedConfig = buildClientScopedConfig(client);

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

    const price = calculatePrice(priceData, scopedConfig);
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
      'SELECT id, settings, telegram_chat_id, google_spreadsheet_id FROM clients WHERE api_key = $1',
      [apiKey]
    );

    if (clientsRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const clientId            = clientsRes.rows[0].id;
    const scopedConfig        = buildClientScopedConfig(clientsRes.rows[0]);
    const clientTgChatId      = clientsRes.rows[0].telegram_chat_id;
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

    const calculatedPrice = calculatePrice(priceData, scopedConfig);

    // Система лояльности: списание при создании, начисление — только после статуса completed
    const requestedBonusUsed = Math.max(0, parseInt(body.bonus_used) || 0);
    let bonusUsed = 0;
    let bonusEarned = 0;
    const loyaltyPercent = scopedConfig.loyalty.loyalty_percent || 5;
    const loyaltyMaxUsagePercent = Math.max(0, Math.min(100, parseFloat(scopedConfig.loyalty.loyalty_max_usage_percent ?? 100) || 100));
    let maxBonusByBalancePercent = 0;
    const phone = normalizePhone(body.phone);

    if (scopedConfig.loyalty.loyalty_enabled && phone) {
      const balRes = await pool.query(
        'SELECT bonus_balance FROM customers WHERE client_id = $1 AND phone = $2 LIMIT 1',
        [clientId, phone]
      );
      const availableBalance = parseInt(balRes.rows[0]?.bonus_balance) || 0;
      maxBonusByBalancePercent = Math.floor(Math.max(0, availableBalance) * loyaltyMaxUsagePercent / 100);
      bonusUsed = Math.min(requestedBonusUsed, availableBalance, maxBonusByBalancePercent, Math.max(0, calculatedPrice));
      const accrualBasePrice = Math.max(0, calculatedPrice - bonusUsed);
      bonusEarned = Math.round(accrualBasePrice * loyaltyPercent / 100);

      console.log('[LOYALTY][ORDER] balance clamp', {
        orderNumber,
        clientId,
        availableBalance,
        loyaltyMaxUsagePercent,
        maxBonusByBalancePercent,
      });
    }

    const finalPrice = Math.max(0, calculatedPrice - bonusUsed);

    // Сохраняем заявку в базу данных
    await pool.query(`
      INSERT INTO orders (
        client_id, order_number, customer_name, phone, customer_email,
        from_address, to_address, floor_num, no_elevator,
        diagnosis, weight, round_trip, payment_method,
        medical_escort, comment, distance, price, status,
        floor_descent, floor_ascent, need_oxygen, escort_count,
        bonus_used, bonus_earned, bonus_applied, trip_datetime
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
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
      finalPrice,
      'new',
      parseInt(body.floor_descent) || 0,
      parseInt(body.floor_ascent) || 0,
      body.need_oxygen ? true : false,
      parseInt(body.escort_count) || 0,
      bonusUsed,
      bonusEarned,
      false,
      body.trip_datetime || null,
    ]);

    console.log('[LOYALTY][ORDER] start', {
      orderNumber,
      clientId,
      loyaltyEnabled: !!scopedConfig.loyalty.loyalty_enabled,
      loyaltyPercent: scopedConfig.loyalty.loyalty_percent || 5,
      rawPhone: body.phone || null,
      bonusUsed,
      calculatedPrice,
      finalPrice,
    });

    if (scopedConfig.loyalty.loyalty_enabled && body.phone) {
      if (!phone) {
        console.warn('[LOYALTY][ORDER] phone normalization failed', { orderNumber, clientId, rawPhone: body.phone });
      }
      bonusEarned = Math.round(finalPrice * loyaltyPercent / 100);

      console.log('[LOYALTY][ORDER] computed', {
        orderNumber,
        clientId,
        phone,
        bonusEarned,
        bonusUsed,
        requestedBonusUsed,
        loyaltyMaxUsagePercent,
        maxBonusByBalancePercent,
      });

      // Списание: уменьшаем баланс (не уходим в минус)
      if (phone && bonusUsed > 0) {
        const deductRes = await pool.query(`
          UPDATE customers SET
            bonus_balance = GREATEST(0, bonus_balance - $1),
            updated_at    = CURRENT_TIMESTAMP
          WHERE client_id = $2 AND phone = $3
        `, [bonusUsed, clientId, phone]);
        console.log('[LOYALTY][ORDER] deduct complete', {
          orderNumber,
          clientId,
          phone,
          bonusUsed,
          affectedRows: deductRes.rowCount || 0,
        });
      }

      console.log('[LOYALTY][ORDER] accrual deferred until status=completed', {
        orderNumber,
        clientId,
        phone,
        bonusEarned,
      });
    } else {
      console.log('[LOYALTY][ORDER] skipped', {
        orderNumber,
        clientId,
        loyaltyEnabled: !!scopedConfig.loyalty.loyalty_enabled,
        hasPhone: !!body.phone,
      });
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
      round_trip: body.round_trip,
      trip_datetime: body.trip_datetime || null,
      status: 'new',
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

    // Проверяем кэш (учитываем форму запроса, чтобы count=1 confirm не конфликтовал с обычными подсказками)
    const cacheKey = `suggest_${JSON.stringify({
      q: String(query || '').trim().toLowerCase(),
      count: Number(req.body.count || count || 5),
      from: req.body.from_bound?.value || '',
      to: req.body.to_bound?.value || '',
      restrict: req.body.restrict_value !== false,
      locations: Array.isArray(req.body.locations) ? req.body.locations : []
    })}`;
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
        } catch { /* fallback to total */ }
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
function calculatePrice(data, scopedConfig = null) {
  const pricing = scopedConfig?.pricing || pricingCache;
  const floorTiers = scopedConfig?.floor_tiers || floorTiersCache;
  const cityRates = scopedConfig?.city_rates || cityRatesCache;

  const perKm        = pricing.per_km ?? 45;
  const baseFixedAdd = pricing.base_fixed_add ?? 0;   // ± фикс. надбавка
  const baseCoeff    = pricing.base_coeff ?? 0;       // % к итогу (0 = выкл)
  const waitingFee   = pricing.waiting_30min ?? 500;
  const oxygenFee    = pricing.oxygen_fee ?? 800;
  const noEscortFee  = pricing.no_escort_fee ?? 300;
  const rtType       = parseInt(pricing.round_trip_type) || 0; // 0=%, 1=фикс
  const rtValue      = parseFloat(pricing.round_trip_value) || 80;

  const dist   = data.totalDistance || 0;
  const weight = parseFloat(data.weight) || 0;

  // --- Стоимость по км с городскими коэффициентами ---
  const toRate   = findCityRate(data.toCity, cityRates);
  const fromRate = findCityRate(data.fromCity, cityRates);
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
    price += data.descentFloors * getFloorPrice('descent', weight, floorTiers);
  }

  // --- Подъём без лифта ---
  if (data.ascentFloors > 0) {
    price += data.ascentFloors * getFloorPrice('ascent', weight, floorTiers);
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

async function resolveClientByApiKey(apiKey) {
  if (!apiKey) return null;
  const result = await pool.query(
    'SELECT id, company_name, settings FROM clients WHERE api_key = $1 LIMIT 1',
    [apiKey]
  );
  return result.rows[0] || null;
}

// Orders list endpoint (для Admin Dashboard)
app.get('/api/orders', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || null;
    const phoneRaw = req.query.phone || null;
    const phone = normalizePhone(phoneRaw);
    const archivedParam = String(req.query.archived || '0').toLowerCase();
    const archivedOnly = archivedParam === '1' || archivedParam === 'true';

    const conditions = ['o.client_id = $1'];
    const params = [client.id];
    conditions.push(archivedOnly ? 'COALESCE(o.archived, FALSE) = TRUE' : 'COALESCE(o.archived, FALSE) = FALSE');
    if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }
    if (phone)  {
      params.push(phone);
      conditions.push(`regexp_replace(COALESCE(o.phone, ''), '\\D', '', 'g') = $${params.length}`);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    let rows = [];
    let total = 0;
    try {
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
      rows = ordersRes.rows;
      total = parseInt(countRes.rows[0].total);
    } catch (queryErr) {
      // Совместимость со старыми БД, где ещё нет колонки orders.archived.
      if (queryErr?.code !== '42703') throw queryErr;

      const legacyConditions = ['o.client_id = $1'];
      const legacyParams = [client.id];
      if (status) { legacyParams.push(status); legacyConditions.push(`o.status = $${legacyParams.length}`); }
      if (phone) {
        legacyParams.push(phone);
        legacyConditions.push(`regexp_replace(COALESCE(o.phone, ''), '\\D', '', 'g') = $${legacyParams.length}`);
      }
      const legacyWhere = 'WHERE ' + legacyConditions.join(' AND ');

      const ordersRes = await pool.query(`
        SELECT o.*, c.company_name
        FROM orders o
        LEFT JOIN clients c ON o.client_id = c.id
        ${legacyWhere}
        ORDER BY o.created_at DESC
        LIMIT $${legacyParams.length + 1} OFFSET $${legacyParams.length + 2}
      `, [...legacyParams, limit, offset]);

      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM orders o ${legacyWhere}`,
        legacyParams
      );
      rows = ordersRes.rows;
      total = parseInt(countRes.rows[0].total);
    }

    res.json({ orders: rows, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order (status + editable fields from Admin modal)
app.patch('/api/orders/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });

    const body = req.body || {};
    const allowed = ['new', 'in_progress', 'completed', 'cancelled'];
    const hasStatus = body.status !== undefined;
    const status = hasStatus ? String(body.status) : null;
    if (hasStatus && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const orderRes = await pool.query(
      `SELECT id, status, phone, price, bonus_earned, bonus_applied
       FROM orders
       WHERE id = $1 AND client_id = $2
       LIMIT 1`,
      [req.params.id, client.id]
    );
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRes.rows[0];

    const updates = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      updates.push(`${sql} = $${params.length}`);
    };

    if (hasStatus) push('status', status);
    if (body.from_address !== undefined) push('from_address', String(body.from_address || '').trim());
    if (body.to_address !== undefined) push('to_address', String(body.to_address || '').trim());
    if (body.diagnosis !== undefined) push('diagnosis', String(body.diagnosis || '').trim());
    if (body.price !== undefined) push('price', Math.max(0, parseFloat(body.price) || 0));
    if (body.distance !== undefined) push('distance', Math.max(0, parseFloat(body.distance) || 0));
    if (body.weight !== undefined) push('weight', Math.max(0, parseFloat(body.weight) || 0));
    if (body.floor_descent !== undefined) push('floor_descent', Math.max(0, parseInt(body.floor_descent, 10) || 0));
    if (body.floor_ascent !== undefined) push('floor_ascent', Math.max(0, parseInt(body.floor_ascent, 10) || 0));
    if (body.medical_escort !== undefined) push('medical_escort', !!body.medical_escort);
    if (body.trip_datetime !== undefined) push('trip_datetime', body.trip_datetime || null);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updateRes = await pool.query(
      `UPDATE orders
       SET ${updates.join(', ')}
       WHERE id = $${params.length + 1} AND client_id = $${params.length + 2}
       RETURNING *`,
      [...params, req.params.id, client.id]
    );
    const updatedOrder = updateRes.rows[0] || order;

    const movedToCompleted = hasStatus && order.status !== 'completed' && status === 'completed';
    if (movedToCompleted && !order.bonus_applied) {
      const phone = normalizePhone(order.phone);
      const bonusEarned = Math.max(0, parseInt(order.bonus_earned) || 0);
      const orderPrice = Math.max(0, parseFloat(order.price) || 0);
      if (phone) {
        const accrualRes = await pool.query(`
          WITH updated AS (
            UPDATE customers
            SET client_id     = $1,
                bonus_balance = bonus_balance + $3,
                total_orders  = total_orders + 1,
                total_spent   = total_spent + $4,
                updated_at    = CURRENT_TIMESTAMP
            WHERE phone = $2 AND (client_id = $1 OR client_id IS NULL)
            RETURNING id, phone, bonus_balance, total_orders, total_spent
          ),
          inserted AS (
            INSERT INTO customers (client_id, phone, bonus_balance, total_orders, total_spent)
            SELECT $1, $2, $3, 1, $4
            WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = $2)
            RETURNING id, phone, bonus_balance, total_orders, total_spent
          )
          SELECT * FROM updated
          UNION ALL
          SELECT * FROM inserted
          LIMIT 1
        `, [client.id, phone, bonusEarned, orderPrice]);

        await pool.query(
          'UPDATE orders SET bonus_applied = TRUE, bonus_applied_at = CURRENT_TIMESTAMP WHERE id = $1 AND client_id = $2',
          [req.params.id, client.id]
        );

        console.log('[LOYALTY][STATUS] completed accrual applied', {
          orderId: req.params.id,
          clientId: client.id,
          phone,
          bonusEarned,
          orderPrice,
          row: accrualRes.rows[0] || null,
        });
      }
    }

    try {
      const sheetOrder = {
        orderNumber: updatedOrder.order_number,
        customer_name: updatedOrder.customer_name,
        phone: updatedOrder.phone,
        email: updatedOrder.customer_email,
        from_address: updatedOrder.from_address,
        to_address: updatedOrder.to_address,
        distance: updatedOrder.distance,
        price: updatedOrder.price,
        weight: updatedOrder.weight,
        diagnosis: updatedOrder.diagnosis,
        comment: updatedOrder.comment,
        floor_descent: updatedOrder.floor_descent,
        floor_ascent: updatedOrder.floor_ascent,
        medical_escort: updatedOrder.medical_escort,
        need_oxygen: updatedOrder.need_oxygen,
        round_trip: updatedOrder.round_trip,
        status: updatedOrder.status,
        trip_datetime: updatedOrder.trip_datetime || null,
      };
      const spreadsheetIdRes = await pool.query('SELECT google_spreadsheet_id FROM clients WHERE id = $1 LIMIT 1', [client.id]);
      const spreadsheetId = spreadsheetIdRes.rows[0]?.google_spreadsheet_id || null;
      if (spreadsheetId) {
        upsertOrderInSheet(sheetOrder, spreadsheetId).catch((e) => {
          console.error('❌ Sheets sync on order update error:', e.message);
        });
      }
    } catch (syncErr) {
      console.error('❌ Failed to schedule sheets sync after order patch:', syncErr.message);
    }

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/:id/archive', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });

    const archived = !!(req.body && req.body.archived);
    const updateRes = await pool.query(
      `UPDATE orders
       SET archived = $1
       WHERE id = $2 AND client_id = $3
       RETURNING id, archived`,
      [archived, req.params.id, client.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.json({ success: true, archived: updateRes.rows[0].archived });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });

    const delRes = await pool.query(
      'DELETE FROM orders WHERE id = $1 AND client_id = $2 RETURNING id',
      [req.params.id, client.id]
    );
    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Публичный endpoint для виджета — без API-ключа
app.get('/api/pricing/public', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    let scoped = null;
    if (apiKey) {
      const client = await resolveClientByApiKey(apiKey);
      if (client) scoped = buildClientScopedConfig(client);
    }

    res.json({
      per_km:           scoped?.pricing.per_km ?? pricingCache.per_km ?? 45,
      base_fixed_add:   scoped?.pricing.base_fixed_add ?? pricingCache.base_fixed_add ?? 0,
      base_coeff:       scoped?.pricing.base_coeff ?? pricingCache.base_coeff ?? 0,
      waiting_30min:    scoped?.pricing.waiting_30min ?? pricingCache.waiting_30min ?? 500,
      oxygen_fee:       scoped?.pricing.oxygen_fee ?? pricingCache.oxygen_fee ?? 800,
      no_escort_fee:    scoped?.pricing.no_escort_fee ?? pricingCache.no_escort_fee ?? 300,
      round_trip_type:  scoped?.pricing.round_trip_type ?? pricingCache.round_trip_type ?? 0,
      round_trip_value: scoped?.pricing.round_trip_value ?? pricingCache.round_trip_value ?? 80,
      floor_tiers:      scoped?.floor_tiers || floorTiersCache,
      city_rates:       scoped?.city_rates || cityRatesCache,
      company:          scoped?.company || companyCache,
      bonus: {
        enabled: !!(scoped?.loyalty.loyalty_enabled ?? pricingCache.loyalty_enabled),
        percent: scoped?.loyalty.loyalty_percent ?? pricingCache.loyalty_percent ?? 5,
        max_usage_percent: scoped?.loyalty.loyalty_max_usage_percent ?? 100,
      },
      calculator_fields: {
        medical_escort: scoped?.raw?.calculator_fields?.medical_escort !== false,
        need_oxygen: scoped?.raw?.calculator_fields?.need_oxygen !== false,
        email: scoped?.raw?.calculator_fields?.email !== false,
        comment: scoped?.raw?.calculator_fields?.comment !== false,
        diagnosis: scoped?.raw?.calculator_fields?.diagnosis !== false,
        escort_count: scoped?.raw?.calculator_fields?.escort_count !== false,
        round_trip: scoped?.raw?.calculator_fields?.round_trip !== false,
        trip_date: scoped?.raw?.calculator_fields?.trip_date !== false,
      },
      widget_display_mode: scoped?.raw?.widget_display_mode || 'hybrid',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pricing endpoints
app.get('/api/pricing', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const scoped = buildClientScopedConfig(client);
    const rows = Object.entries(scoped.pricing).map(([key, value]) => ({ key, value, label: key }));
    res.json({ pricing: rows, cache: scoped.pricing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pricing', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });

    const updates = req.body;
    const allowed = ['per_km', 'base_fixed_add', 'base_coeff', 'waiting_30min', 'oxygen_fee', 'no_escort_fee', 'round_trip_type', 'round_trip_value'];

    const allowNegative = new Set(['base_fixed_add', 'base_coeff', 'round_trip_value']);
    const nextPricing = { ...buildClientScopedConfig(client).pricing };
    for (const [key, value] of Object.entries(updates)) {
      if (!allowed.includes(key)) continue;
      const num = parseFloat(value);
      if (isNaN(num)) return res.status(400).json({ error: `Invalid value for ${key}` });
      if (!allowNegative.has(key) && num < 0) return res.status(400).json({ error: `${key} cannot be negative` });
      nextPricing[key] = num;
    }

    await saveClientScopedSettings(client.id, (current) => ({
      ...current,
      pricing: nextPricing,
    }));

    res.json({ success: true, pricing: nextPricing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Company settings
app.get('/api/company', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const scoped = buildClientScopedConfig(client);
    res.json({ settings: scoped.company });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/company', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const allowed = ['base_address', 'base_coords', 'policy_url', 'agreement_url'];
    const nextCompany = { ...buildClientScopedConfig(client).company };
    for (const [key, value] of Object.entries(req.body)) {
      if (!allowed.includes(key)) continue;
      nextCompany[key] = value;
    }
    await saveClientScopedSettings(client.id, (current) => ({
      ...current,
      company: nextCompany,
    }));
    res.json({ success: true, settings: nextCompany });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calculator-fields', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const settings = parseClientSettings(client.settings);
    const next = {
      medical_escort: settings?.calculator_fields?.medical_escort !== false,
      need_oxygen: settings?.calculator_fields?.need_oxygen !== false,
      email: settings?.calculator_fields?.email !== false,
      comment: settings?.calculator_fields?.comment !== false,
      diagnosis: settings?.calculator_fields?.diagnosis !== false,
      escort_count: settings?.calculator_fields?.escort_count !== false,
      round_trip: settings?.calculator_fields?.round_trip !== false,
      trip_date: settings?.calculator_fields?.trip_date !== false,
    };
    const mode = settings?.widget_display_mode || 'hybrid';
    res.json({ fields: next, widget_display_mode: mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/calculator-fields', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });

    const incoming = req.body || {};
    const allowed = ['medical_escort', 'need_oxygen', 'email', 'comment', 'diagnosis', 'escort_count', 'round_trip', 'trip_date'];
    const allowedModes = new Set(['page_only', 'drawer_only', 'hybrid']);
    const current = parseClientSettings(client.settings);
    const next = {
      medical_escort: current?.calculator_fields?.medical_escort !== false,
      need_oxygen: current?.calculator_fields?.need_oxygen !== false,
      email: current?.calculator_fields?.email !== false,
      comment: current?.calculator_fields?.comment !== false,
      diagnosis: current?.calculator_fields?.diagnosis !== false,
      escort_count: current?.calculator_fields?.escort_count !== false,
      round_trip: current?.calculator_fields?.round_trip !== false,
      trip_date: current?.calculator_fields?.trip_date !== false,
    };
    const nextMode = allowedModes.has(incoming.widget_display_mode)
      ? incoming.widget_display_mode
      : (current?.widget_display_mode || 'hybrid');

    for (const key of allowed) {
      if (incoming[key] !== undefined) next[key] = !!incoming[key];
    }

    await saveClientScopedSettings(client.id, (prev) => ({
      ...prev,
      calculator_fields: next,
      widget_display_mode: nextMode,
    }));

    res.json({ success: true, fields: next, widget_display_mode: nextMode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Floor tiers
app.get('/api/pricing/floor-tiers', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const scoped = buildClientScopedConfig(client);
    res.json({ tiers: scoped.floor_tiers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pricing/floor-tiers', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const { tiers } = req.body; // [{direction, weight_from, weight_to, price_per_floor}]
    if (!Array.isArray(tiers)) return res.status(400).json({ error: 'tiers must be array' });

    const nextTiers = {
      descent: tiers.filter(t => t.direction === 'descent'),
      ascent: tiers.filter(t => t.direction === 'ascent'),
    };

    await saveClientScopedSettings(client.id, (current) => ({
      ...current,
      floor_tiers: nextTiers,
    }));

    res.json({ success: true, tiers: nextTiers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// City rates
app.get('/api/pricing/city-rates', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const scoped = buildClientScopedConfig(client);
    res.json({ rates: scoped.city_rates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pricing/city-rates', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const { city_name, rate_type, value, is_fixed_price, note } = req.body;
    if (!city_name) return res.status(400).json({ error: 'city_name required' });
    const scoped = buildClientScopedConfig(client);
    const nextRates = [...(scoped.city_rates || [])];
    const id = Date.now();
    nextRates.push({ id, city_name, rate_type: rate_type || 'percent', value: parseFloat(value) || 0, is_fixed_price: !!is_fixed_price, note: note || '' });
    await saveClientScopedSettings(client.id, (current) => ({
      ...current,
      city_rates: nextRates,
    }));
    res.json({ success: true, id, rates: nextRates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pricing/city-rates/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const { city_name, rate_type, value, is_fixed_price, note } = req.body;
    const scoped = buildClientScopedConfig(client);
    const id = String(req.params.id);
    const nextRates = (scoped.city_rates || []).map((r) => {
      if (String(r.id) !== id) return r;
      return {
        ...r,
        city_name,
        rate_type,
        value: parseFloat(value),
        is_fixed_price: !!is_fixed_price,
        note: note || '',
      };
    });
    await saveClientScopedSettings(client.id, (current) => ({
      ...current,
      city_rates: nextRates,
    }));
    res.json({ success: true, rates: nextRates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pricing/city-rates/:id', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const scoped = buildClientScopedConfig(client);
    const id = String(req.params.id);
    const nextRates = (scoped.city_rates || []).filter(r => String(r.id) !== id);
    await saveClientScopedSettings(client.id, (current) => ({
      ...current,
      city_rates: nextRates,
    }));
    res.json({ success: true, rates: nextRates });
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
      } catch {}
    }

    // Email сервисного аккаунта Google (берём из файла или из ENV)
    let sheets_service_email = null;
    const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
    const keyJsonEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    const parseKeyJson = (raw) => {
      try {
        const txt = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        const keyData = JSON.parse(txt);
        return keyData.client_email || null;
      } catch {
        return null;
      }
    };

    if (keyFile) {
      try {
        sheets_service_email = parseKeyJson(fs.readFileSync(keyFile, 'utf8'));
      } catch {}
    }
    if (!sheets_service_email && keyJsonEnv) {
      sheets_service_email = parseKeyJson(keyJsonEnv);
    }

    res.json({
      telegram_chat_id:      client.telegram_chat_id      || null,
      google_spreadsheet_id: client.google_spreadsheet_id || null,
      google_spreadsheet_url: client.google_spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${client.google_spreadsheet_id}/edit` : null,
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

// POST /api/sheets/sync-client — принудительная синхронизация всех заявок клиента в Google Sheets
app.post('/api/sheets/sync-client', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  if (!sheetsClient) return res.status(500).json({ error: 'Google Sheets не настроен на сервере' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });

    const clientRes = await pool.query('SELECT google_spreadsheet_id FROM clients WHERE id = $1 LIMIT 1', [client.id]);
    const spreadsheetId = clientRes.rows[0]?.google_spreadsheet_id;
    if (!spreadsheetId) return res.status(400).json({ error: 'ID таблицы не указан. Введите его в настройках.' });

    const ordersRes = await pool.query(
      `SELECT order_number, customer_name, phone, customer_email, from_address, to_address, distance, price,
              weight, diagnosis, floor_descent, floor_ascent, medical_escort, need_oxygen, round_trip,
              comment, status, trip_datetime
       FROM orders
       WHERE client_id = $1
       ORDER BY created_at ASC`,
      [client.id]
    );

    const sheetName = process.env.GOOGLE_SHEET_NAME || 'Заявки';
    await ensureSheetHeaders(spreadsheetId, sheetName);

    const rows = ordersRes.rows.map((o) => buildSheetOrderRow({
      orderNumber: o.order_number,
      customer_name: o.customer_name,
      phone: o.phone,
      email: o.customer_email,
      from_address: o.from_address,
      to_address: o.to_address,
      distance: o.distance,
      price: o.price,
      weight: o.weight,
      diagnosis: o.diagnosis,
      floor_descent: o.floor_descent,
      floor_ascent: o.floor_ascent,
      medical_escort: o.medical_escort,
      need_oxygen: o.need_oxygen,
      round_trip: o.round_trip,
      comment: o.comment,
      status: o.status,
      trip_datetime: o.trip_datetime,
    }));

    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A2:S`,
    });

    if (rows.length > 0) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2:S`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      });
    }

    res.json({ success: true, synced: rows.length, spreadsheet_id: spreadsheetId });
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
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (!pool) return res.json({ phone, bonus_balance: 0, total_orders: 0 });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const { rows } = await pool.query(
      'SELECT bonus_balance, total_orders, total_spent FROM customers WHERE client_id = $1 AND phone = $2',
      [client.id, normalizePhone(phone)]
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
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const limit  = parseInt(req.query.limit)  || 50;
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await pool.query(
      'SELECT id, phone, bonus_balance, total_orders, total_spent, created_at FROM customers WHERE client_id = $1 ORDER BY total_spent DESC LIMIT $2 OFFSET $3',
      [client.id, limit, offset]
    );
    const countRes = await pool.query('SELECT COUNT(*) FROM customers WHERE client_id = $1', [client.id]);
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
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const { rows } = await pool.query(`
      WITH updated AS (
        UPDATE customers
        SET client_id = $1,
            bonus_balance = GREATEST(0, bonus_balance + $3),
            updated_at = CURRENT_TIMESTAMP
        WHERE phone = $2 AND (client_id = $1 OR client_id IS NULL)
        RETURNING bonus_balance
      ),
      inserted AS (
        INSERT INTO customers (client_id, phone, bonus_balance)
        SELECT $1, $2, GREATEST(0, $3)
        WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = $2)
        RETURNING bonus_balance
      )
      SELECT bonus_balance FROM updated
      UNION ALL
      SELECT bonus_balance FROM inserted
      LIMIT 1
    `, [client.id, normalizePhone(phone), parseInt(delta)]);
    res.json({ phone, bonus_balance: rows[0].bonus_balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOYALTY: настройки (GET) ─────────────────────────────────────────────────
app.get('/api/loyalty/settings', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  const client = await resolveClientByApiKey(apiKey);
  if (!client) return res.status(401).json({ error: 'Invalid API key' });
  const scoped = buildClientScopedConfig(client);
  res.json({
    loyalty_enabled: scoped.loyalty.loyalty_enabled || 0,
    loyalty_percent: scoped.loyalty.loyalty_percent || 5,
    loyalty_max_usage_percent: scoped.loyalty.loyalty_max_usage_percent ?? 100,
  });
});

// ─── LOYALTY: настройки (PUT) ─────────────────────────────────────────────────
app.put('/api/loyalty/settings', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  const { loyalty_enabled, loyalty_percent, loyalty_max_usage_percent } = req.body;
  if (!pool) return res.status(503).json({ error: 'DB not available' });
  try {
    const client = await resolveClientByApiKey(apiKey);
    if (!client) return res.status(401).json({ error: 'Invalid API key' });
    const enabled = loyalty_enabled ? 1 : 0;
    const percent = Math.max(0, Math.min(100, parseFloat(loyalty_percent) || 5));
    const maxUsagePercent = Math.max(0, Math.min(100, parseFloat(loyalty_max_usage_percent ?? 100) || 100));
    await saveClientScopedSettings(client.id, (current) => ({
      ...current,
      loyalty: {
        loyalty_enabled: enabled,
        loyalty_percent: percent,
        loyalty_max_usage_percent: maxUsagePercent,
      }
    }));
    res.json({ success: true, loyalty_enabled: enabled, loyalty_percent: percent, loyalty_max_usage_percent: maxUsagePercent });
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

// ─── SUPERADMIN API ────────────────────────────────────────────────

// JWT для суперадминов (простая реализация)
const jwt = require('jsonwebtoken');
const SUPERADMIN_SECRET = process.env.SUPERADMIN_SECRET || 'superadmin-secret-key';

// Middleware для проверки суперадмин токена
function requireSuperAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });
  
  try {
    const decoded = jwt.verify(token, SUPERADMIN_SECRET);
    req.superadmin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Расширение таблицы clients для суперадмин функционала
async function ensureSuperAdminTables() {
  if (!pool) return;
  
  try {
    // Добавляем поля в таблицу clients
    await pool.query(`
      ALTER TABLE clients 
      ADD COLUMN IF NOT EXISTS license_type VARCHAR(20) DEFAULT 'trial',
      ADD COLUMN IF NOT EXISTS trial_until TIMESTAMP,
      ADD COLUMN IF NOT EXISTS paid_until TIMESTAMP,
      ADD COLUMN IF NOT EXISTS allowed_domains TEXT[],
      ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
    `);
    
    // Создаем таблицу суперадминов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Создаем первого суперадмина если нет
    const adminCount = await pool.query('SELECT COUNT(*) FROM super_admins');
    if (adminCount.rows[0].count === '0') {
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO super_admins (email, password_hash) VALUES ($1, $2)',
        ['superadmin@medical-calculator', passwordHash]
      );
      console.log('✅ Создан суперадмин: superadmin@medical-calculator / admin123');
    }
  } catch (error) {
    console.error('Error ensuring superadmin tables:', error);
  }
}

// Авторизация суперадмина
app.post('/api/superadmin/auth', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    const result = await pool.query(
      'SELECT * FROM super_admins WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const bcrypt = require('bcrypt');
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { email: admin.email, id: admin.id },
      SUPERADMIN_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, admin: { id: admin.id, email: admin.email } });
  } catch (error) {
    console.error('Superadmin auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение списка клиентов
app.get('/api/superadmin/clients', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    // Сначала проверим структуру таблицы
    const tableInfo = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'clients' 
      ORDER BY ordinal_position
    `);
    
    console.log('Clients table columns:', tableInfo.rows.map(r => r.column_name));
    
    // Базовый запрос с обязательными полями
    let query = `
      SELECT 
        c.id,
        c.api_key
    `;
    
    // Добавляем поля если они существуют
    const columns = tableInfo.rows.map(r => r.column_name);
    if (columns.includes('license_type')) query += `, c.license_type`;
    if (columns.includes('trial_until')) query += `, c.trial_until`;
    if (columns.includes('paid_until')) query += `, c.paid_until`;
    if (columns.includes('allowed_domains')) query += `, c.allowed_domains`;
    if (columns.includes('company_name')) query += `, c.company_name`;
    if (columns.includes('contact_email')) query += `, c.contact_email`;
    if (columns.includes('created_at')) query += `, c.created_at`;
    
    // Добавляем статистику по заказам
    query += `,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.price), 0) as total_revenue
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
      GROUP BY c.id, c.api_key`;
    
    // Добавляем поля в GROUP BY если они существуют
    if (columns.includes('license_type')) query += `, c.license_type`;
    if (columns.includes('trial_until')) query += `, c.trial_until`;
    if (columns.includes('paid_until')) query += `, c.paid_until`;
    if (columns.includes('allowed_domains')) query += `, c.allowed_domains`;
    if (columns.includes('company_name')) query += `, c.company_name`;
    if (columns.includes('contact_email')) query += `, c.contact_email`;
    if (columns.includes('created_at')) query += `, c.created_at`;
    
    query += ` ORDER BY c.id DESC`;
    
    console.log('Executing query:', query);
    
    const result = await pool.query(query);
    
    const clients = result.rows.map(client => ({
      ...client,
      allowed_domains: client.allowed_domains || []
    }));
    
    // Статистика с безопасными значениями
    const stats = {
      total: clients.length,
      trial: clients.filter(c => c.license_type === 'trial').length,
      paid: clients.filter(c => c.license_type === 'paid').length,
      blocked: clients.filter(c => c.license_type === 'blocked').length
    };
    
    res.json({ clients, stats });
  } catch (error) {
    console.error('Error loading clients:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Создание клиента
app.post('/api/superadmin/clients', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });

    const { company_name, contact_email, license_type, allowed_domains, trial_until, paid_until } = req.body;
    const createdClient = await createClientProvision({
      company_name,
      contact_email,
      license_type,
      allowed_domains,
      trial_until,
      paid_until,
      settings: buildDefaultClientSettings(),
    });
    await sendClientOnboardingEmail(createdClient, createdClient.api_key);

    res.json(createdClient);
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновление клиента
app.put('/api/superadmin/clients/:id', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    const { id } = req.params;
    const { company_name, contact_email, license_type, allowed_domains, trial_until, paid_until } = req.body;
    
    const result = await pool.query(`
      UPDATE clients 
      SET company_name = $1, contact_email = $2, license_type = $3, 
          allowed_domains = $4, trial_until = $5, paid_until = $6
      WHERE id = $7
      RETURNING *
    `, [company_name, contact_email, license_type, allowed_domains, trial_until, paid_until, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удаление клиента
app.delete('/api/superadmin/clients/:id', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Регенерация API ключа
app.post('/api/superadmin/clients/:id/regenerate-key', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    const { id } = req.params;

    const newApiKey = await generateUniqueApiKey();
    
    const result = await pool.query(
      'UPDATE clients SET api_key = $1 WHERE id = $2 RETURNING api_key',
      [newApiKey, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json({ api_key: newApiKey });
  } catch (error) {
    console.error('Error regenerating key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение общей статистики
app.get('/api/superadmin/stats', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    // Общая статистика
    const revenueResult = await pool.query('SELECT COALESCE(SUM(price), 0) as total FROM orders');
    const ordersResult = await pool.query('SELECT COUNT(*) as total FROM orders');
    const clientsResult = await pool.query(`
      SELECT COUNT(*) as total 
      FROM clients 
      WHERE license_type IN ('trial', 'paid')
    `);
    
    const totalRevenue = parseFloat(revenueResult.rows[0].total);
    const totalOrders = parseInt(ordersResult.rows[0].total);
    const activeClients = parseInt(clientsResult.rows[0].total);
    
    res.json({
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      avg_order_value: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      active_clients: activeClients
    });
  } catch (error) {
    console.error('Error loading stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение списка signup requests (для контроля автоонбординга)
app.get('/api/superadmin/signup-requests', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

    const where = [];
    const values = [];

    if (status) {
      where.push(`sr.status = $${values.length + 1}`);
      values.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    values.push(limit);
    values.push(offset);
    const limitParam = `$${values.length - 1}`;
    const offsetParam = `$${values.length}`;

    const dataRes = await pool.query(`
      SELECT
        sr.id,
        sr.company_name,
        sr.contact_email,
        sr.domain,
        sr.plan_code,
        sr.payment_provider,
        sr.payment_id,
        sr.status,
        sr.license_type,
        sr.trial_until,
        sr.paid_until,
        sr.client_id,
        sr.created_at,
        sr.updated_at,
        c.company_name AS client_company_name,
        c.api_key AS client_api_key
      FROM signup_requests sr
      LEFT JOIN clients c ON c.id = sr.client_id
      ${whereSql}
      ORDER BY sr.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, values);

    const countValues = status ? [status] : [];
    const countWhereSql = status ? 'WHERE sr.status = $1' : '';
    const countRes = await pool.query(`
      SELECT COUNT(*)::INT AS total
      FROM signup_requests sr
      ${countWhereSql}
    `, countValues);

    res.json({
      items: dataRes.rows,
      total: countRes.rows[0]?.total || 0,
      limit,
      offset,
      status: status || null,
    });
  } catch (error) {
    console.error('Error loading signup requests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение списка админов
app.get('/api/superadmin/admins', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    const result = await pool.query(`
      SELECT id, email, created_at 
      FROM super_admins 
      ORDER BY created_at DESC
    `);
    
    res.json({ admins: result.rows });
  } catch (error) {
    console.error('Error loading admins:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Создание админа
app.post('/api/superadmin/admins', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    const { email, password } = req.body;
    
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO super_admins (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, passwordHash]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating admin:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Удаление админа
app.delete('/api/superadmin/admins/:id', requireSuperAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM super_admins WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Инициализация суперадмин таблиц при запуске
// Вызывается в initializeDatabase() после подключения к БД
