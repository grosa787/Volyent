/**
 * Google Sheets API client.
 * Communicates with the deployed Google Apps Script web app.
 * 
 * NOTE: Google Apps Script Web Apps return 302 redirects.
 * Node's fetch with redirect:'follow' sometimes gets HTML instead of JSON.
 * We handle this by manually following redirects.
 */

const SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
const ACTIVATION_KEYS_URL = process.env.ACTIVATION_KEYS_URL || 'https://script.google.com/macros/s/AKfycbz_54oXTlMDtt0PKxwix4ghMHAx0X0t4AlKYT3rjhbMdZU_unw6dXtVUfQUB7aRDuZM3A/exec';

/**
 * Follow redirects manually and return JSON.
 * Google Apps Script returns 302 → we need to GET the Location header.
 */
async function fetchWithRedirect(url, options = {}) {
    const res = await fetch(url, { ...options, redirect: 'manual' });

    // If redirect, follow it with a simple GET
    if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (location) {
            const followRes = await fetch(location, { redirect: 'follow' });
            const text = await followRes.text();
            try {
                return JSON.parse(text);
            } catch {
                console.error(`Sheets API: non-JSON response from redirect: ${text.substring(0, 200)}`);
                return null;
            }
        }
    }

    // Direct response
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        console.error(`Sheets API: non-JSON response: ${text.substring(0, 200)}`);
        return null;
    }
}

/**
 * Make a request to Google Sheets API.
 * @param {'GET'|'POST'} method - HTTP method
 * @param {string} action - Action name for the Apps Script
 * @param {object} data - Data to send
 */
async function sheetsRequest(method, action, data = {}) {
    if (!SHEETS_URL) {
        console.error('GOOGLE_SHEETS_URL not configured');
        return null;
    }

    try {
        if (method === 'POST') {
            return await fetchWithRedirect(SHEETS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...data }),
            });
        } else {
            // GET request
            const params = new URLSearchParams({ action, ...data });
            return await fetchWithRedirect(`${SHEETS_URL}?${params}`);
        }
    } catch (err) {
        console.error(`Sheets API error (${action}):`, err.message);
        return null;
    }
}

/**
 * Get user from Google Sheets.
 */
async function sheetsGetUser(telegramId) {
    return sheetsRequest('GET', 'getUser', { telegram_id: String(telegramId) });
}

/**
 * Get user's VPN keys.
 */
async function sheetsGetUserKeys(telegramId) {
    return sheetsRequest('GET', 'getUserKeys', { telegram_id: String(telegramId) });
}

/**
 * Create or update user in Google Sheets.
 */
async function sheetsUpsertUser({ telegramId, username, displayName }) {
    return sheetsRequest('POST', 'upsertUser', {
        telegram_id: String(telegramId),
        username: username || '',
        display_name: displayName || '',
    });
}

/**
 * Add a VPN key for a user.
 */
async function sheetsAddKey({ telegramId, key, username, displayName }) {
    return sheetsRequest('POST', 'addKey', {
        telegram_id: String(telegramId),
        key,
        username: username || '',
        display_name: displayName || '',
    });
}

/**
 * Grant subscription days and optionally add a key.
 */
async function sheetsRecordPayment({ telegramId, days, key, username, displayName }) {
    return sheetsRequest('POST', 'recordPayment', {
        telegram_id: String(telegramId),
        days,
        key: key || null,
        username: username || '',
        display_name: displayName || '',
    });
}

/**
 * Fetch/claim keys from ActivationKeys Google Sheet.
 * First checks for existing claimed keys; if none, claims a new one.
 */
async function sheetsGetActivationKeys(telegramId, username) {
    if (!ACTIVATION_KEYS_URL) return { keys: [] };
    try {
        const params = new URLSearchParams({ action: 'getMyKeys', telegram_id: String(telegramId) });
        const myKeys = await fetchWithRedirect(`${ACTIVATION_KEYS_URL}?${params}`);
        if (myKeys && myKeys.keys && myKeys.keys.length > 0) {
            return myKeys;
        }
        // No keys, claim one
        const claimParams = new URLSearchParams({
            action: 'claimKey',
            telegram_id: String(telegramId),
            username: username || '',
        });
        const claimResult = await fetchWithRedirect(`${ACTIVATION_KEYS_URL}?${claimParams}`);
        if (claimResult && claimResult.key) {
            return { keys: [claimResult.key] };
        }
        return { keys: [] };
    } catch (err) {
        console.error('ActivationKeys API error:', err.message);
        return { keys: [] };
    }
}

module.exports = {
    sheetsGetUser,
    sheetsGetUserKeys,
    sheetsUpsertUser,
    sheetsAddKey,
    sheetsRecordPayment,
    sheetsGetActivationKeys,
};
