/**
 * /me route — returns current user profile, connection info, and keys.
 * Protected by JWT middleware.
 */

const express = require('express');
const { findUserByTelegramId } = require('../db');
const { sheetsGetUserKeys, sheetsGetActivationKeys } = require('../sheets');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /me — user profile
router.get('/', authMiddleware, async (req, res) => {
    const user = await findUserByTelegramId(req.user.telegram_id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Fetch keys from both sources in parallel
    let keys = [];
    try {
        const [mainResult, activationResult] = await Promise.all([
            sheetsGetUserKeys(req.user.telegram_id).catch(() => null),
            sheetsGetActivationKeys(req.user.telegram_id, user.username).catch(() => null),
        ]);
        if (mainResult?.keys) keys.push(...mainResult.keys);
        if (activationResult?.keys) keys.push(...activationResult.keys);
        // Deduplicate
        keys = [...new Set(keys)];
    } catch (err) {
        console.error('Failed to fetch keys:', err.message);
    }

    res.json({
        telegram_id: user.telegram_id,
        username: user.username,
        display_name: user.display_name,
        photo_url: user.photo_url,
        subscription_until: user.subscription_until,
        allowed: Boolean(user.allowed),
        assigned_ip: user.assigned_ip || '185.10.10.23',
        keys,
    });
});

module.exports = router;
