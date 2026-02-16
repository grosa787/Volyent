/**
 * Auth routes — Telegram Login Widget flow.
 *
 * GET  /auth/telegram/start    → HTML page with Telegram Login Widget
 * GET  /auth/telegram/callback → Validate hash, upsert user, redirect to deep link
 * POST /auth/exchange          → Exchange one-time code for access_token + profile
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { upsertUser, findUserByTelegramId } = require('../db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Telegram hash validation
// ---------------------------------------------------------------------------

/**
 * Validate Telegram Login Widget data.
 * @param {object} data - All query params from Telegram widget (including hash)
 * @param {string} botToken - The bot token from BotFather
 * @param {number} maxAgeSeconds - Maximum allowed age of auth_date (default: 86400 = 24h)
 * @returns {boolean}
 */
function validateTelegramHash(data, botToken, maxAgeSeconds = 86400) {
  const { hash, ...rest } = data;
  if (!hash) return false;

  // Check auth_date freshness
  const authDate = parseInt(rest.auth_date, 10);
  if (isNaN(authDate)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSeconds) return false;

  // Build data_check_string: sort keys, join as key=value with \n
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('\n');

  // secret_key = SHA256(bot_token)
  const secretKey = crypto.createHash('sha256').update(botToken).digest();

  // expected = HMAC_SHA256(data_check_string, secret_key)
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return hmac === hash;
}

// ---------------------------------------------------------------------------
// GET /auth/telegram/start
// ---------------------------------------------------------------------------

router.get('/telegram/start', (req, res) => {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
  // Serve a minimal HTML page with the Telegram Login Widget.
  // The widget redirects to /auth/telegram/callback with user data.
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Volyent — Sign in with Telegram</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f0f14;
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .card {
          text-align: center;
          padding: 48px;
          border-radius: 16px;
          background: #1a1a24;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        h1 {
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 600;
        }
        p {
          margin: 0 0 32px;
          color: #888;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Volyent</h1>
        <p>Sign in with your Telegram account</p>
        <script
          async
          src="https://telegram.org/js/telegram-widget.js?22"
          data-telegram-login="${process.env.TELEGRAM_BOT_USERNAME || 'YourBotUsername'}"
          data-size="large"
          data-radius="8"
          data-auth-url="${backendUrl}/auth/telegram/callback"
          data-request-access="write"
        ></script>
      </div>
    </body>
    </html>
  `);
});

// ---------------------------------------------------------------------------
// GET /auth/telegram/callback
// ---------------------------------------------------------------------------

router.get('/telegram/callback', async (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Server misconfigured: missing TELEGRAM_BOT_TOKEN' });
  }

  // Validate Telegram data
  if (!validateTelegramHash(req.query, botToken)) {
    return res.status(403).json({ error: 'Invalid Telegram authentication data' });
  }

  // Upsert user
  const user = await upsertUser({
    id: parseInt(req.query.id, 10),
    username: req.query.username,
    first_name: req.query.first_name,
    last_name: req.query.last_name,
    photo_url: req.query.photo_url,
  });

  // Create a one-time exchange code (JWT, 60s TTL)
  const code = jwt.sign(
    { telegram_id: user.telegram_id, purpose: 'exchange' },
    process.env.JWT_SECRET,
    { expiresIn: '60s' }
  );

  // Redirect to the custom URL scheme
  const scheme = process.env.APP_URL_SCHEME || 'volyent';
  res.redirect(`${scheme}://auth?code=${code}`);
});

// ---------------------------------------------------------------------------
// POST /auth/exchange
// ---------------------------------------------------------------------------

router.post('/exchange', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }

  let decoded;
  try {
    decoded = jwt.verify(code, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  if (decoded.purpose !== 'exchange') {
    return res.status(401).json({ error: 'Invalid code purpose' });
  }

  const user = await findUserByTelegramId(decoded.telegram_id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Issue tokens
  const accessToken = jwt.sign(
    { telegram_id: user.telegram_id, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  const refreshToken = jwt.sign(
    { telegram_id: user.telegram_id, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      telegram_id: user.telegram_id,
      username: user.username,
      display_name: user.display_name,
      photo_url: user.photo_url,
      subscription_until: user.subscription_until,
      allowed: Boolean(user.allowed),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /auth/bot-redirect — bot-initiated auth redirect
// ---------------------------------------------------------------------------

router.get('/bot-redirect', async (req, res) => {
  const telegramId = parseInt(req.query.tg_id, 10);
  if (!telegramId) {
    return res.status(400).send('Missing tg_id');
  }

  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    return res.status(404).send('User not found. Please use /start in the bot first.');
  }

  // Generate a one-time exchange code
  const code = jwt.sign(
    { telegram_id: user.telegram_id, purpose: 'exchange' },
    process.env.JWT_SECRET,
    { expiresIn: '120s' }
  );

  const scheme = process.env.APP_URL_SCHEME || 'volyent';
  const deepLink = `${scheme}://auth?code=${code}`;

  // Serve HTML that auto-redirects to the deep link
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Volyent — Открытие приложения</title>
      <style>
        body {
          margin: 0; min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: #0f0f14; color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .card {
          text-align: center; padding: 48px; border-radius: 16px;
          background: #1a1a24; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        h1 { margin: 0 0 8px; font-size: 24px; }
        p { margin: 0 0 24px; color: #888; font-size: 14px; }
        a.btn {
          display: inline-block; padding: 14px 32px; border-radius: 12px;
          background: linear-gradient(135deg, #6c5ce7, #a855f7);
          color: #fff; text-decoration: none; font-weight: 600; font-size: 16px;
        }
        a.btn:hover { opacity: 0.9; }
        .note { margin-top: 16px; color: #555; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🚀 Volyent</h1>
        <p>Открываем приложение...</p>
        <a class="btn" href="${deepLink}">Открыть Volyent</a>
        <p class="note">Если приложение не открылось автоматически, нажмите кнопку выше.</p>
      </div>
      <script>
        // Auto-redirect after a short delay
        setTimeout(function() { window.location.href = "${deepLink}"; }, 500);
      </script>
    </body>
    </html>
  `);
});

// Export for testing
module.exports = router;
module.exports.validateTelegramHash = validateTelegramHash;
