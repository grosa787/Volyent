/**
 * SettingsScreen — Account, Servers, Connection, About.
 * Cleaned up layout with single "Add Server" section.
 */

import React, { useState, useEffect } from 'react';

export default function SettingsScreen({
    user,
    isAuthenticated,
    onSignIn,
    onSignOut,
    onBack,
    customKeys = [],
    onAddKey,
    onRemoveKey,
    subscriptions = [],
    subServers = [],
    subLoading,
    onAddSubscription,
    onRemoveSubscription,
    onRefreshSubscriptions,
    connectionState,
}) {
    const [input, setInput] = useState('');
    const [feedback, setFeedback] = useState({ msg: '', type: '' });
    const [loading, setLoading] = useState(false);
    const [trafficStats, setTrafficStats] = useState({ uplink: 0, downlink: 0, sessionUplink: 0, sessionDownlink: 0 });
    const [appVersion, setAppVersion] = useState('...');
    const [updateStatus, setUpdateStatus] = useState(null); // null | 'checking' | 'latest' | { version, url }
    const [autoLaunch, setAutoLaunch] = useState(false);

    // Get app version + auto-launch on mount
    useEffect(() => {
        window.volyent?.getVersion?.().then(v => v && setAppVersion(v));
        window.volyent?.getAutoLaunch?.().then(v => setAutoLaunch(!!v));
    }, []);

    const handleAutoLaunchToggle = async () => {
        const newVal = !autoLaunch;
        setAutoLaunch(newVal);
        await window.volyent?.setAutoLaunch?.(newVal);
    };

    // Poll traffic stats every 2s
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const stats = await window.volyent?.vpn?.stats();
                if (stats) setTrafficStats(stats);
            } catch { /* ok */ }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 2000);
        return () => clearInterval(interval);
    }, [connectionState]);

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const val = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
        return `${val} ${units[i]}`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    const showFeedback = (msg, type = 'error') => {
        setFeedback({ msg, type });
        if (type === 'success') setTimeout(() => setFeedback({ msg: '', type: '' }), 2000);
    };

    const compareSemver = (a, b) => {
        const pa = a.replace(/^v/, '').split('.').map(Number);
        const pb = b.replace(/^v/, '').split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if ((pa[i] || 0) < (pb[i] || 0)) return -1;
            if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        }
        return 0;
    };

    const checkForUpdates = async () => {
        setUpdateStatus('checking');
        try {
            const res = await window.volyent?.fetchUrl('https://api.github.com/repos/grosa787/Volyent/releases/latest');
            if (!res?.ok) { setUpdateStatus('error'); return; }
            const data = JSON.parse(res.text);
            const latestTag = data.tag_name; // e.g. "v1.0.7"
            const dmgAsset = data.assets?.find(a => a.name.endsWith('.dmg'));
            if (compareSemver(appVersion, latestTag) < 0 && dmgAsset) {
                setUpdateStatus({ version: latestTag.replace(/^v/, ''), url: dmgAsset.browser_download_url });
            } else {
                setUpdateStatus('latest');
            }
        } catch {
            setUpdateStatus('error');
        }
    };

    const handleAdd = async () => {
        setFeedback({ msg: '', type: '' });
        const trimmed = input.trim();
        if (!trimmed) { showFeedback('Вставь ключ или ссылку'); return; }

        // Subscription URL
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            setLoading(true);
            const ok = await onAddSubscription(trimmed, '');
            setLoading(false);
            if (ok) {
                setInput('');
                showFeedback('Подписка добавлена ✓', 'success');
            } else {
                showFeedback('Не удалось загрузить подписку');
            }
            return;
        }

        // VLESS key
        if (trimmed.startsWith('vless://')) {
            const ok = onAddKey(trimmed);
            if (ok) {
                setInput('');
                showFeedback('Сервер добавлен ✓', 'success');
            } else {
                showFeedback('Неверный формат VLESS ключа');
            }
            return;
        }

        showFeedback('Поддерживаются vless:// и https:// ссылки');
    };

    return (
        <div className="settings-screen fade-in">
            <div className="settings-header">
                <button className="back-btn" onClick={onBack} title="Back">←</button>
                <span className="settings-title">Settings</span>
            </div>

            <div className="settings-content">
                {/* Account */}
                <div className="settings-section">
                    <div className="settings-section-title">Account</div>
                    {isAuthenticated ? (
                        <>
                            <div className="settings-item">
                                <span className="settings-item-label">User</span>
                                <span className="settings-item-value">{user?.display_name || user?.username || '—'}</span>
                            </div>
                            <div className="settings-item">
                                <span className="settings-item-label">Plan</span>
                                <span className={`settings-item-value ${user?.allowed ? 'success' : 'danger'}`}>
                                    {user?.allowed ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <div className="settings-item">
                                <span className="settings-item-label">Expires</span>
                                <span className="settings-item-value">{formatDate(user?.subscription_until)}</span>
                            </div>
                            <div style={{ padding: '12px 16px' }}>
                                <button className="auth-btn signout" onClick={onSignOut}>Sign out</button>
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '12px 16px' }}>
                            <button className="auth-btn telegram" onClick={onSignIn}>✈ Sign in with Telegram</button>
                        </div>
                    )}
                </div>

                {/* Add Server — single input for VLESS key or sub URL */}
                <div className="settings-section">
                    <div className="settings-section-title">Add Server</div>
                    <div className="vless-input-row">
                        <input
                            type="text"
                            className="vless-input"
                            placeholder="vless://... или https://..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            spellCheck={false}
                        />
                        <button className="vless-add-btn" onClick={handleAdd} disabled={loading}>
                            {loading ? '⏳' : '+'}
                        </button>
                    </div>
                    {feedback.msg && <div className={`vless-feedback ${feedback.type}`}>{feedback.msg}</div>}
                </div>

                {/* Subscriptions */}
                {subscriptions.length > 0 && (
                    <div className="settings-section">
                        <div className="settings-section-title">
                            <span>Subscriptions ({subscriptions.length})</span>
                            <button
                                className="sub-refresh-btn"
                                onClick={onRefreshSubscriptions}
                                disabled={subLoading}
                                title="Refresh"
                            >
                                {subLoading ? '⏳' : '🔄'}
                            </button>
                        </div>
                        {subscriptions.map((sub) => {
                            const count = subServers.filter(s => s.id.startsWith(`${sub.id}-`)).length;
                            let hostname = '';
                            try { hostname = new URL(sub.url).hostname; } catch { hostname = sub.url; }
                            return (
                                <div key={sub.id} className="settings-item">
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="settings-item-label" style={{ fontSize: '13px' }}>
                                            {sub.name || hostname}
                                        </div>
                                        <div className="settings-sub-meta">
                                            {count} servers • {hostname}
                                        </div>
                                    </div>
                                    <button className="vless-remove-btn" onClick={() => onRemoveSubscription(sub.id)}>✕</button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Custom VLESS Keys */}
                {customKeys.length > 0 && (
                    <div className="settings-section">
                        <div className="settings-section-title">VLESS Keys ({customKeys.length})</div>
                        {customKeys.map((k) => (
                            <div key={k.id} className="settings-item">
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="settings-item-label" style={{ fontSize: '13px' }}>
                                        {k.flag} {k.label || k.host}
                                    </div>
                                    <div className="settings-sub-meta">{k.host}:{k.port}</div>
                                </div>
                                <button className="vless-remove-btn" onClick={() => onRemoveKey(k.id)}>✕</button>
                            </div>
                        ))}
                    </div>
                )}


                {/* Traffic Statistics */}
                <div className="settings-section">
                    <div className="settings-section-title">Traffic</div>

                    {/* Session stats */}
                    <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Current session
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1, background: 'rgba(0,200,150,0.08)', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>↑</span>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Upload</div>
                                    <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent)' }}>
                                        {formatBytes(trafficStats.sessionUplink || 0)}
                                    </div>
                                </div>
                            </div>
                            <div style={{ flex: 1, background: 'rgba(100,150,255,0.08)', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>↓</span>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Download</div>
                                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#6496ff' }}>
                                        {formatBytes(trafficStats.sessionDownlink || 0)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Total stats */}
                    <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            All time
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>↑ Total Upload</div>
                                <div style={{ fontSize: '14px', fontWeight: 500 }}>
                                    {formatBytes(trafficStats.uplink || 0)}
                                </div>
                            </div>
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>↓ Total Download</div>
                                <div style={{ fontSize: '14px', fontWeight: 500 }}>
                                    {formatBytes(trafficStats.downlink || 0)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* About & Updates */}
                <div className="settings-section">
                    <div className="settings-section-title">About</div>
                    <div className="settings-item">
                        <span className="settings-item-label">Version</span>
                        <span className="settings-item-value">{appVersion}</span>
                    </div>
                    <div className="settings-item">
                        <span className="settings-item-label">Launch at login</span>
                        <button
                            className={`toggle-btn ${autoLaunch ? 'active' : ''}`}
                            onClick={handleAutoLaunchToggle}
                        >
                            <span className="toggle-knob" />
                        </button>
                    </div>
                    <div style={{ padding: '8px 16px 12px' }}>
                        {updateStatus === null && (
                            <button className="update-check-btn" onClick={checkForUpdates}>
                                Check for Updates
                            </button>
                        )}
                        {updateStatus === 'checking' && (
                            <div className="update-status checking">⏳ Checking...</div>
                        )}
                        {updateStatus === 'latest' && (
                            <div className="update-status latest">✓ You're up to date</div>
                        )}
                        {updateStatus === 'error' && (
                            <div className="update-status error-status">
                                Failed to check
                                <button className="update-retry-btn" onClick={checkForUpdates}>Retry</button>
                            </div>
                        )}
                        {updateStatus && typeof updateStatus === 'object' && (
                            <div className="update-available">
                                <div className="update-available-text">
                                    🎉 Update {updateStatus.version} available!
                                </div>
                                <button
                                    className="update-download-btn"
                                    onClick={() => window.volyent?.openExternal(updateStatus.url)}
                                >
                                    Download Update
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
