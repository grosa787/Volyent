/**
 * Volyent Server — Entry point.
 * Works both locally (node src/index.js) and on Vercel (serverless).
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const { handleUpdate, registerWebhook, getBot } = require('./bot');
const { initDb, migrateDb } = require('./db');
const { checkExpiringSubscriptions } = require('./cron');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/auth', authRoutes);
app.use('/me', meRoutes);

// Deep link redirector (Telegram doesn't support custom URL schemes)
app.get('/open', (_req, res) => {
    res.send(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Volyent</title>
<script>
  window.location.href = 'volyent://open';
  setTimeout(function() { window.location.href = '${process.env.DOWNLOAD_SITE_URL || 'https://volyent.com/download'}'; }, 1500);
</script>
</head><body style="background:#0a0a12;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Открываю Volyent…</p>
</body></html>`);
});

// Telegram bot webhook endpoint
app.post('/api/bot-webhook', async (req, res) => {
    try {
        await handleUpdate(req.body);
        res.sendStatus(200);
    } catch (err) {
        console.error('Webhook error:', err.message);
        res.sendStatus(200); // Always 200 to prevent Telegram retries
    }
});

// One-time webhook registration endpoint
app.get('/api/setup-webhook', async (req, res) => {
    try {
        const backendUrl = process.env.BACKEND_URL;
        if (!backendUrl) return res.status(400).json({ error: 'BACKEND_URL not set' });
        await registerWebhook(backendUrl);
        res.json({ ok: true, webhook: `${backendUrl}/api/bot-webhook` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DB init endpoint (run once after deploy)
app.get('/api/init-db', async (req, res) => {
    try {
        const dbUrl = process.env.TURSO_DATABASE_URL;
        const hasToken = !!process.env.TURSO_AUTH_TOKEN;
        console.log('init-db: TURSO_DATABASE_URL =', dbUrl, 'hasToken =', hasToken);
        await initDb();
        await migrateDb();
        res.json({ ok: true, message: 'Tables created & migrated', dbUrl, hasToken });
    } catch (err) {
        console.error('init-db error:', err);
        res.status(500).json({ error: err.message, stack: err.stack, dbUrl: process.env.TURSO_DATABASE_URL || 'NOT SET' });
    }
});

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cron endpoint for subscription expiry reminders
app.get('/api/cron', async (_req, res) => {
    try {
        const result = await checkExpiringSubscriptions();
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('Cron error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Local dev: start server with polling bot
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`Volyent server running on http://localhost:${PORT}`);
        // In local dev, you can still use webhook via ngrok
        // or switch to polling for convenience
    });
}

module.exports = app;
