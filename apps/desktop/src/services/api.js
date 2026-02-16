/**
 * API service — all backend HTTP calls.
 * Reads the backend URL from env. Attaches Bearer token.
 */

const BACKEND_URL = 'https://server-five-lac-14.vercel.app';

/**
 * Make an authenticated API request.
 */
async function request(path, options = {}) {
    const token = await window.volyent?.keychain.get('access_token');

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const res = await fetch(`${BACKEND_URL}${path}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
    }

    return res.json();
}

/**
 * Exchange one-time code for tokens.
 */
export async function exchangeCode(code) {
    return request('/auth/exchange', {
        method: 'POST',
        body: JSON.stringify({ code }),
    });
}

/**
 * Fetch current user profile.
 */
export async function fetchProfile() {
    return request('/me');
}

/**
 * Open Telegram auth page.
 */
export function openTelegramAuth() {
    const url = `${BACKEND_URL}/auth/telegram/start`;
    window.volyent?.openExternal(url);
}

/**
 * Fetch activation keys from the Google Sheet.
 * First checks if user already has claimed keys, then claims one if not.
 * @param {object} user - { telegram_id, username, display_name }
 */
const KEYS_SHEET_URL = 'https://script.google.com/macros/s/AKfycbz_54oXTlMDtt0PKxwix4ghMHAx0X0t4AlKYT3rjhbMdZU_unw6dXtVUfQUB7aRDuZM3A/exec';

async function fetchFromSheet(params) {
    const url = `${KEYS_SHEET_URL}?${new URLSearchParams(params).toString()}`;
    let text;
    if (window.volyent?.fetchUrl) {
        const result = await window.volyent.fetchUrl(url);
        if (!result.ok) throw new Error(result.error || 'Fetch failed');
        text = result.text;
    } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
    }
    return JSON.parse(text);
}

export async function fetchActivationKeys(user) {
    try {
        const tgId = user?.telegram_id || user?.id;
        const username = user?.username || user?.display_name || '';

        if (!tgId) {
            return { ok: false, keys: [], error: 'No telegram_id' };
        }

        // 1. Check if user already has claimed keys
        const myData = await fetchFromSheet({ action: 'getMyKeys', telegram_id: tgId });
        if (myData.keys && myData.keys.length > 0) {
            return { ok: true, keys: myData.keys };
        }

        // 2. No keys yet — claim one
        const claimData = await fetchFromSheet({
            action: 'claimKey',
            telegram_id: tgId,
            username: username,
        });

        if (claimData.key) {
            return { ok: true, keys: [claimData.key] };
        }

        if (claimData.error) {
            return { ok: false, keys: [], error: claimData.error };
        }

        return { ok: true, keys: [] };
    } catch (err) {
        console.error('Failed to fetch activation keys:', err.message);
        return { ok: false, keys: [], error: err.message };
    }
}

export default { exchangeCode, fetchProfile, openTelegramAuth, fetchActivationKeys };
