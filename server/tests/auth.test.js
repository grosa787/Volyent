/**
 * Tests for Telegram hash validation and /auth/exchange endpoint.
 * Uses Node.js built-in test runner (node --test).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Set env before requiring app modules
process.env.JWT_SECRET = 'test_jwt_secret_for_testing_only';
process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token_123456';
process.env.APP_URL_SCHEME = 'volyent';
process.env.PORT = '0'; // random port

const { validateTelegramHash } = require('../src/routes/auth');
const { upsertUser } = require('../src/db');

// ---------------------------------------------------------------------------
// Helper: Generate valid Telegram login data with correct hash
// ---------------------------------------------------------------------------
function generateTelegramData(botToken, overrides = {}) {
    const data = {
        id: '123456789',
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        photo_url: 'https://t.me/i/photo.jpg',
        auth_date: String(Math.floor(Date.now() / 1000)),
        ...overrides,
    };

    // Compute correct hash
    const dataCheckString = Object.keys(data)
        .sort()
        .map((k) => `${k}=${data[k]}`)
        .join('\n');

    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return { ...data, hash };
}

// ---------------------------------------------------------------------------
// Tests: validateTelegramHash
// ---------------------------------------------------------------------------

describe('validateTelegramHash', () => {
    const botToken = 'test_bot_token_123456';

    it('should return true for valid data', () => {
        const data = generateTelegramData(botToken);
        assert.equal(validateTelegramHash(data, botToken), true);
    });

    it('should return false for tampered data', () => {
        const data = generateTelegramData(botToken);
        data.first_name = 'Hacker'; // tamper
        assert.equal(validateTelegramHash(data, botToken), false);
    });

    it('should return false for expired auth_date', () => {
        const data = generateTelegramData(botToken, {
            auth_date: String(Math.floor(Date.now() / 1000) - 90000), // ~25 hours ago
        });
        assert.equal(validateTelegramHash(data, botToken), false);
    });

    it('should return false if hash is missing', () => {
        const data = generateTelegramData(botToken);
        delete data.hash;
        assert.equal(validateTelegramHash(data, botToken), false);
    });
});

// ---------------------------------------------------------------------------
// Tests: POST /auth/exchange
// ---------------------------------------------------------------------------

describe('POST /auth/exchange', () => {
    let app;
    let server;
    let baseUrl;

    before(async () => {
        // Ensure a user exists
        upsertUser({
            id: 123456789,
            username: 'testuser',
            first_name: 'Test',
            last_name: 'User',
            photo_url: 'https://t.me/i/photo.jpg',
        });

        app = require('../src/index');
        server = app.listen(0);
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    after(() => {
        if (server) server.close();
    });

    it('should return tokens and profile for a valid code', async () => {
        // Create a valid exchange code
        const code = jwt.sign(
            { telegram_id: 123456789, purpose: 'exchange' },
            process.env.JWT_SECRET,
            { expiresIn: '60s' }
        );

        const res = await fetch(`${baseUrl}/auth/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });

        assert.equal(res.status, 200);

        const body = await res.json();
        assert.ok(body.access_token, 'should have access_token');
        assert.ok(body.refresh_token, 'should have refresh_token');
        assert.equal(body.user.telegram_id, 123456789);
        assert.equal(body.user.username, 'testuser');
        assert.equal(body.user.display_name, 'Test User');
        assert.equal(body.user.allowed, true);
    });

    it('should return 401 for an invalid code', async () => {
        const res = await fetch(`${baseUrl}/auth/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: 'invalid.jwt.token' }),
        });

        assert.equal(res.status, 401);
    });

    it('should return 401 for a code with wrong purpose', async () => {
        const code = jwt.sign(
            { telegram_id: 123456789, purpose: 'access' },
            process.env.JWT_SECRET,
            { expiresIn: '60s' }
        );

        const res = await fetch(`${baseUrl}/auth/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });

        assert.equal(res.status, 401);
    });
});

// ---------------------------------------------------------------------------
// Tests: GET /me
// ---------------------------------------------------------------------------

describe('GET /me', () => {
    let app;
    let server;
    let baseUrl;

    before(async () => {
        upsertUser({
            id: 123456789,
            username: 'testuser',
            first_name: 'Test',
            last_name: 'User',
        });

        app = require('../src/index');
        server = app.listen(0);
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    after(() => {
        if (server) server.close();
    });

    it('should return profile for valid token', async () => {
        const token = jwt.sign(
            { telegram_id: 123456789, type: 'access' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const res = await fetch(`${baseUrl}/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.telegram_id, 123456789);
        assert.ok(body.assigned_ip);
    });

    it('should return 401 without token', async () => {
        const res = await fetch(`${baseUrl}/me`);
        assert.equal(res.status, 401);
    });
});
