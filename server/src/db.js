/**
 * Volyent Server — Turso (LibSQL) database.
 * Async client for serverless environments.
 */

const { createClient } = require('@libsql/client/web');

let _client;

function getDb() {
  if (!_client) {
    let url = process.env.TURSO_DATABASE_URL || '';
    // Vercel serverless needs https:// instead of libsql://
    if (url.startsWith('libsql://')) {
      url = url.replace('libsql://', 'https://');
    }
    _client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

/**
 * Initialize tables (run once on first deploy).
 */
async function initDb() {
  const db = getDb();
  await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id   INTEGER UNIQUE NOT NULL,
            username      TEXT,
            display_name  TEXT,
            photo_url     TEXT,
            subscription_until TEXT,
            allowed       INTEGER DEFAULT 0,
            assigned_ip   TEXT DEFAULT '185.10.10.23',
            referred_by   INTEGER,
            referral_count INTEGER DEFAULT 0,
            trial_used    INTEGER DEFAULT 0,
            language      TEXT DEFAULT 'ru',
            created_at    TEXT DEFAULT (datetime('now'))
        )
    `);
  await db.execute(`
        CREATE TABLE IF NOT EXISTS payments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id     INTEGER NOT NULL,
            telegram_payment_charge_id TEXT,
            provider_payment_charge_id TEXT,
            amount_stars    INTEGER NOT NULL,
            plan            TEXT NOT NULL,
            days_granted    INTEGER NOT NULL,
            created_at      TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
        )
    `);
}

/**
 * Upsert a user from Telegram login data.
 */
async function upsertUser(telegramUser) {
  const db = getDb();
  const displayName = [telegramUser.first_name, telegramUser.last_name]
    .filter(Boolean)
    .join(' ') || telegramUser.username || 'User';

  await db.execute({
    sql: `INSERT INTO users (telegram_id, username, display_name, photo_url)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(telegram_id) DO UPDATE SET
                username     = excluded.username,
                display_name = excluded.display_name,
                photo_url    = excluded.photo_url`,
    args: [
      telegramUser.id,
      telegramUser.username || null,
      displayName,
      telegramUser.photo_url || null,
    ],
  });

  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE telegram_id = ?',
    args: [telegramUser.id],
  });
  return result.rows[0] || null;
}

/**
 * Find a user by telegram_id.
 */
async function findUserByTelegramId(telegramId) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE telegram_id = ?',
    args: [telegramId],
  });
  return result.rows[0] || null;
}

/**
 * Grant subscription days to a user.
 */
async function grantSubscription(telegramId, days) {
  const db = getDb();
  const user = await findUserByTelegramId(telegramId);

  let baseDate = new Date();
  if (user && user.subscription_until) {
    const existing = new Date(user.subscription_until);
    if (existing > baseDate) {
      baseDate = existing;
    }
  }

  baseDate.setDate(baseDate.getDate() + days);
  const newUntil = baseDate.toISOString().split('T')[0];

  await db.execute({
    sql: 'UPDATE users SET allowed = 1, subscription_until = ? WHERE telegram_id = ?',
    args: [newUntil, telegramId],
  });

  return newUntil;
}

/**
 * Record a payment.
 */
async function recordPayment({ telegramId, telegramChargeId, providerChargeId, amountStars, plan, daysGranted }) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO payments (telegram_id, telegram_payment_charge_id, provider_payment_charge_id, amount_stars, plan, days_granted)
              VALUES (?, ?, ?, ?, ?, ?)`,
    args: [telegramId, telegramChargeId, providerChargeId, amountStars, plan, daysGranted],
  });
}

/**
 * Migrate existing tables — add new columns if missing.
 */
async function migrateDb() {
  const db = getDb();
  const cols = [
    { name: 'referred_by', sql: 'ALTER TABLE users ADD COLUMN referred_by INTEGER' },
    { name: 'referral_count', sql: 'ALTER TABLE users ADD COLUMN referral_count INTEGER DEFAULT 0' },
    { name: 'trial_used', sql: 'ALTER TABLE users ADD COLUMN trial_used INTEGER DEFAULT 0' },
    { name: 'language', sql: "ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'ru'" },
  ];
  for (const col of cols) {
    try { await db.execute(col.sql); } catch { /* column already exists */ }
  }
}

/**
 * Mark trial as used for a user.
 */
async function markTrialUsed(telegramId) {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET trial_used = 1 WHERE telegram_id = ?',
    args: [telegramId],
  });
}

/**
 * Save user language preference.
 */
async function setUserLanguage(telegramId, lang) {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET language = ? WHERE telegram_id = ?',
    args: [lang, telegramId],
  });
}

/**
 * Record a referral: set referred_by on new user, increment referrer's count.
 */
async function addReferral(newUserId, referrerId) {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET referred_by = ? WHERE telegram_id = ?',
    args: [referrerId, newUserId],
  });
  await db.execute({
    sql: 'UPDATE users SET referral_count = referral_count + 1 WHERE telegram_id = ?',
    args: [referrerId],
  });
}

/**
 * Get users whose subscription expires on a specific date (YYYY-MM-DD).
 */
async function getUsersExpiringOn(dateStr) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE subscription_until = ? AND allowed = 1',
    args: [dateStr],
  });
  return result.rows;
}

module.exports = {
  getDb, initDb, migrateDb,
  upsertUser, findUserByTelegramId,
  grantSubscription, recordPayment,
  markTrialUsed, setUserLanguage, addReferral, getUsersExpiringOn,
};
