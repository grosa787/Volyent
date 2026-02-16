/**
 * App — root component.
 * Routes between MainScreen and SettingsScreen.
 * Manages auth + connection state + custom VLESS keys + subscription URLs.
 */

import React, { useState, useEffect, useCallback } from 'react';
import MainScreen from './screens/MainScreen';
import SettingsScreen from './screens/SettingsScreen';
import { useAuth } from './hooks/useAuth';
import { useConnection } from './hooks/useConnection';
import { fetchActivationKeys } from './services/api';

const VLESS_KEYS_STORAGE = 'volyent_vless_keys';
const SUBS_STORAGE = 'volyent_subscriptions';
const ACTIVATION_KEYS_STORAGE = 'volyent_activation_keys';

// ─── Persistent storage helpers ─────────────────────────────────────────

function loadJson(key, fallback = []) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function saveJson(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// ─── VLESS URI parsing ──────────────────────────────────────────────────

function parseVlessUri(uri) {
    try {
        if (!uri.startsWith('vless://')) return null;
        const withoutScheme = uri.slice(8);
        const hashIdx = withoutScheme.lastIndexOf('#');
        const mainPart = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme;
        const remark = hashIdx >= 0 ? withoutScheme.slice(hashIdx + 1) : '';
        const qIdx = mainPart.indexOf('?');
        const userHost = qIdx >= 0 ? mainPart.slice(0, qIdx) : mainPart;
        const queryString = qIdx >= 0 ? mainPart.slice(qIdx + 1) : '';
        const atIdx = userHost.indexOf('@');
        const uuid = userHost.slice(0, atIdx);
        const hostPort = userHost.slice(atIdx + 1);
        const colonIdx = hostPort.lastIndexOf(':');
        const host = colonIdx >= 0 ? hostPort.slice(0, colonIdx) : hostPort;
        const port = colonIdx >= 0 ? parseInt(hostPort.slice(colonIdx + 1), 10) : 443;

        const label = remark ? decodeURIComponent(remark) : host;
        const flag = guessFlag(label, host);

        return { uuid, host, port, label, flag, query: queryString };
    } catch {
        return null;
    }
}

function guessFlag(label, host) {
    const text = (label + ' ' + host).toLowerCase();
    const flags = {
        'germany': '🇩🇪', 'de': '🇩🇪', 'frankfurt': '🇩🇪', 'berlin': '🇩🇪',
        'netherlands': '🇳🇱', 'nl': '🇳🇱', 'amsterdam': '🇳🇱',
        'us': '🇺🇸', 'usa': '🇺🇸', 'united states': '🇺🇸', 'new york': '🇺🇸', 'los angeles': '🇺🇸', 'dallas': '🇺🇸', 'chicago': '🇺🇸',
        'uk': '🇬🇧', 'london': '🇬🇧', 'england': '🇬🇧', 'gb': '🇬🇧',
        'france': '🇫🇷', 'fr': '🇫🇷', 'paris': '🇫🇷',
        'japan': '🇯🇵', 'jp': '🇯🇵', 'tokyo': '🇯🇵',
        'singapore': '🇸🇬', 'sg': '🇸🇬',
        'canada': '🇨🇦', 'ca': '🇨🇦', 'toronto': '🇨🇦',
        'russia': '🇷🇺', 'ru': '🇷🇺', 'moscow': '🇷🇺',
        'finland': '🇫🇮', 'fi': '🇫🇮', 'helsinki': '🇫🇮',
        'turkey': '🇹🇷', 'tr': '🇹🇷', 'istanbul': '🇹🇷',
        'sweden': '🇸🇪', 'se': '🇸🇪', 'stockholm': '🇸🇪',
        'poland': '🇵🇱', 'pl': '🇵🇱', 'warsaw': '🇵🇱',
        'australia': '🇦🇺', 'au': '🇦🇺', 'sydney': '🇦🇺',
        'brazil': '🇧🇷', 'br': '🇧🇷', 'sao paulo': '🇧🇷',
        'india': '🇮🇳', 'in': '🇮🇳', 'mumbai': '🇮🇳',
        'korea': '🇰🇷', 'kr': '🇰🇷', 'seoul': '🇰🇷',
        'hong kong': '🇭🇰', 'hk': '🇭🇰',
        'italy': '🇮🇹', 'it': '🇮🇹', 'milan': '🇮🇹',
        'spain': '🇪🇸', 'es': '🇪🇸', 'madrid': '🇪🇸',
        'ukraine': '🇺🇦', 'ua': '🇺🇦', 'kyiv': '🇺🇦',
        'czech': '🇨🇿', 'cz': '🇨🇿', 'prague': '🇨🇿',
        'austria': '🇦🇹', 'at': '🇦🇹', 'vienna': '🇦🇹',
        'ireland': '🇮🇪', 'ie': '🇮🇪', 'dublin': '🇮🇪',
        'romania': '🇷🇴', 'ro': '🇷🇴', 'bucharest': '🇷🇴',
        'kazakhstan': '🇰🇿', 'kz': '🇰🇿',
    };
    for (const [key, flag] of Object.entries(flags)) {
        if (text.includes(key)) return flag;
    }
    return '🌐';
}

// ─── Subscription URL fetching ──────────────────────────────────────────

async function fetchSubscription(url) {
    try {
        let text;

        // Use IPC fetch through main process (bypasses CORS)
        if (window.volyent?.fetchUrl) {
            const result = await window.volyent.fetchUrl(url);
            if (!result.ok) throw new Error(result.error || 'Fetch failed');
            text = result.text;
        } else {
            // Fallback for dev mode
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            text = await res.text();
        }

        // Try base64 decode
        let decoded;
        try {
            decoded = atob(text.trim());
        } catch {
            decoded = text;
        }

        // Split by newlines, parse each URI
        const lines = decoded.split('\n').map(l => l.trim()).filter(Boolean);
        const servers = [];

        for (const line of lines) {
            if (line.startsWith('vless://')) {
                const parsed = parseVlessUri(line);
                if (parsed) {
                    servers.push({ ...parsed, uri: line });
                }
            }
            // Skip non-vless protocols for now
        }

        return { ok: true, servers, total: lines.length };
    } catch (err) {
        return { ok: false, error: err.message, servers: [] };
    }
}

// ─── App component ──────────────────────────────────────────────────────

const BOT_URL = 'https://t.me/Volyent_bot';

export default function App() {
    const [screen, setScreen] = useState('main');
    const auth = useAuth();

    // Custom single VLESS keys
    const [customKeys, setCustomKeys] = useState(() => loadJson(VLESS_KEYS_STORAGE));

    // Subscription URLs + their resolved servers
    const [subscriptions, setSubscriptions] = useState(() => loadJson(SUBS_STORAGE));
    const [subServers, setSubServers] = useState([]);
    const [subLoading, setSubLoading] = useState(false);

    // Activation keys from Google Sheet (persisted in localStorage)
    const [activationKeys, setActivationKeys] = useState(() => loadJson(ACTIVATION_KEYS_STORAGE));

    // Subscription expired modal
    const [showExpiredModal, setShowExpiredModal] = useState(false);

    const connection = useConnection();

    // ── Fetch activation keys when user authenticates ──
    useEffect(() => {
        if (!auth.isAuthenticated || !auth.user) {
            setActivationKeys([]);
            return;
        }

        let cancelled = false;

        async function loadKeys() {
            const result = await fetchActivationKeys(auth.user);
            if (cancelled) return;
            if (result.ok && result.keys.length > 0) {
                const allServers = [];
                for (const key of result.keys) {
                    if (key.startsWith('https://')) {
                        // Subscription URL — fetch and resolve to VLESS servers
                        const subResult = await fetchSubscription(key);
                        if (!cancelled && subResult.ok) {
                            subResult.servers.forEach(s => {
                                allServers.push({ ...s, id: `activation-${allServers.length}`, uri: s.uri });
                            });
                        }
                    } else {
                        const p = parseVlessUri(key);
                        if (p) allServers.push({ ...p, id: `activation-${allServers.length}`, uri: key });
                    }
                }
                if (!cancelled) {
                    setActivationKeys(allServers);
                    saveJson(ACTIVATION_KEYS_STORAGE, allServers);
                }
            }
        }

        loadKeys();
        return () => { cancelled = true; };
    }, [auth.isAuthenticated, auth.user]);

    // ── Fetch all subscriptions on mount & when list changes ──
    const refreshSubscriptions = useCallback(async () => {
        if (subscriptions.length === 0) {
            setSubServers([]);
            return;
        }
        setSubLoading(true);
        const allServers = [];

        for (const sub of subscriptions) {
            const result = await fetchSubscription(sub.url);
            if (result.ok) {
                const tagged = result.servers.map((s, i) => ({
                    ...s,
                    id: `${sub.id}-${i}`,
                    subName: sub.name || sub.url,
                }));
                allServers.push(...tagged);
            }
        }

        setSubServers(allServers);
        setSubLoading(false);
    }, [subscriptions]);

    useEffect(() => {
        refreshSubscriptions();
    }, [refreshSubscriptions]);

    // ── Show expired modal when subscription expires ──
    useEffect(() => {
        if (auth.isAuthenticated && !auth.isSubscriptionActive && !auth.loading) {
            setShowExpiredModal(true);
        } else {
            setShowExpiredModal(false);
        }
    }, [auth.isAuthenticated, auth.isSubscriptionActive, auth.loading]);

    // ── Custom key handlers ──
    const handleAddKey = (vlessUri) => {
        const parsed = parseVlessUri(vlessUri);
        if (!parsed) return false;
        const updated = [...customKeys, { ...parsed, id: `custom-${Date.now()}`, uri: vlessUri }];
        setCustomKeys(updated);
        saveJson(VLESS_KEYS_STORAGE, updated);
        return true;
    };

    const handleRemoveKey = (keyId) => {
        const updated = customKeys.filter(k => k.id !== keyId);
        setCustomKeys(updated);
        saveJson(VLESS_KEYS_STORAGE, updated);
    };

    // ── Subscription handlers ──
    const handleAddSubscription = async (url, name) => {
        const sub = { id: `sub-${Date.now()}`, url, name: name || url, addedAt: new Date().toISOString() };
        const updated = [...subscriptions, sub];
        setSubscriptions(updated);
        saveJson(SUBS_STORAGE, updated);
        return true;
    };

    const handleRemoveSubscription = (subId) => {
        const updated = subscriptions.filter(s => s.id !== subId);
        setSubscriptions(updated);
        saveJson(SUBS_STORAGE, updated);
    };

    // ── Server switch (disconnect + reconnect) ──
    const handleSwitchServer = async (newUri) => {
        await connection.disconnect();
        // Small delay to ensure cleanup
        setTimeout(() => connection.connect(newUri), 300);
    };

    const handleOpenBot = () => {
        if (window.volyent?.openExternal) {
            window.volyent.openExternal(BOT_URL);
        } else {
            window.open(BOT_URL, '_blank');
        }
    };

    return (
        <div className="app">
            <div className="titlebar-space" />

            {/* Subscription expired modal */}
            {showExpiredModal && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <div className="modal-icon">⏰</div>
                        <h2 className="modal-title">Подписка истекла</h2>
                        <p className="modal-text">
                            {auth.user?.subscription_until
                                ? `Твоя подписка закончилась ${auth.user.subscription_until}.`
                                : 'У тебя нет активной подписки.'}
                        </p>
                        <p className="modal-text-sub">
                            Продли подписку через нашего бота в Telegram, чтобы продолжить пользоваться VPN.
                        </p>
                        <button className="modal-btn-primary" onClick={handleOpenBot}>
                            🤖 Открыть бота в Telegram
                        </button>
                        <button className="modal-btn-secondary" onClick={() => setShowExpiredModal(false)}>
                            Закрыть
                        </button>
                    </div>
                </div>
            )}

            {screen === 'main' ? (
                <MainScreen
                    connectionState={connection.state}
                    ip={connection.ip}
                    errorMsg={connection.errorMsg}
                    isAuthenticated={auth.isAuthenticated}
                    isSubscriptionActive={auth.isSubscriptionActive}
                    onToggle={connection.toggle}
                    onSwitchServer={handleSwitchServer}
                    onOpenSettings={() => setScreen('settings')}
                    customKeys={customKeys}
                    subServers={subServers}
                    subscriptions={subscriptions}
                    subLoading={subLoading}
                    activationKeys={activationKeys}
                    onSignIn={auth.signIn}
                    onAddKey={handleAddKey}
                    onAddSubscription={handleAddSubscription}
                />
            ) : (
                <SettingsScreen
                    user={auth.user}
                    isAuthenticated={auth.isAuthenticated}
                    connectionState={connection.state}
                    onSignIn={auth.signIn}
                    onSignOut={async () => {
                        connection.disconnect();
                        await auth.signOut();
                    }}
                    onBack={() => setScreen('main')}
                    customKeys={customKeys}
                    onAddKey={handleAddKey}
                    onRemoveKey={handleRemoveKey}
                    subscriptions={subscriptions}
                    subServers={subServers}
                    subLoading={subLoading}
                    onAddSubscription={handleAddSubscription}
                    onRemoveSubscription={handleRemoveSubscription}
                    onRefreshSubscriptions={refreshSubscriptions}
                />
            )}
        </div>
    );
}
