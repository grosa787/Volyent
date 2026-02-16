/**
 * ServerSelector — scrollable server list with subscription tabs, real ping, and favorites.
 * Each subscription gets its own tab so users can switch between sources.
 * Favorite servers (⭐) are pinned to the top.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';

export default function ServerSelector({
    selectedId,
    onSelect,
    customKeys = [],
    subServers = [],
    subscriptions = [],
    subLoading = false,
    activationKeys = [],
    isAuthenticated = false,
    onOpenAddServer,
    favorites = [],
    onToggleFavorite,
}) {
    const [activeTab, setActiveTab] = useState('all');
    const [pings, setPings] = useState({});
    const pingRef = useRef(false);

    // Build server items from each source
    const customItems = customKeys.map(k => ({
        id: k.id,
        flag: k.flag || '🌐',
        name: k.label || k.host,
        host: k.host,
        port: k.port,
        location: `${k.host}:${k.port}`,
        badge: 'CUSTOM',
        source: 'custom',
    }));

    const subItems = subServers.map(s => ({
        id: s.id,
        flag: s.flag || '🌐',
        name: s.label || s.host,
        host: s.host,
        port: s.port,
        location: `${s.host}:${s.port}`,
        badge: 'SUB',
        source: s.id.replace(/-\d+$/, ''),
    }));

    const activationItems = activationKeys.map(a => ({
        id: a.id,
        flag: a.flag || '🔑',
        name: a.label || a.host,
        host: a.host,
        port: a.port,
        location: `${a.host}:${a.port}`,
        badge: 'KEY',
        source: 'activation',
    }));

    const allServers = [...activationItems, ...customItems, ...subItems];
    const hasServers = allServers.length > 0;

    // Ping all servers on mount / when server list changes
    useEffect(() => {
        if (!window.volyent?.ping || allServers.length === 0) return;
        if (pingRef.current) return;
        pingRef.current = true;

        async function pingAll() {
            const results = {};
            for (const server of allServers) {
                try {
                    const res = await window.volyent.ping(server.host, server.port || 443);
                    results[server.id] = res.ok ? res.ms : -1;
                } catch {
                    results[server.id] = -1;
                }
            }
            setPings(results);
            pingRef.current = false;
        }

        pingAll();
    }, [allServers.length]);

    // Build tabs
    const tabs = useMemo(() => {
        const t = [];
        t.push({ id: 'all', label: 'All', count: allServers.length });

        if (activationItems.length > 0) {
            t.push({ id: 'activation', label: '🔑 Keys', count: activationItems.length });
        }

        for (const sub of subscriptions) {
            const subKey = sub.id;
            const count = subItems.filter(s => s.source === subKey).length;
            let label;
            try { label = new URL(sub.url).hostname.split('.').slice(-2, -1)[0] || `Sub`; }
            catch { label = sub.name || 'Sub'; }
            label = label.charAt(0).toUpperCase() + label.slice(1);
            t.push({ id: subKey, label, count });
        }

        if (customItems.length > 0) {
            t.push({ id: 'custom', label: 'Custom', count: customItems.length });
        }

        return t;
    }, [subscriptions, allServers.length, activationItems.length, subItems.length, customItems.length]);

    // Filter servers by active tab
    const filteredServers = useMemo(() => {
        let servers;
        if (activeTab === 'all') servers = allServers;
        else if (activeTab === 'activation') servers = activationItems;
        else if (activeTab === 'custom') servers = customItems;
        else servers = subItems.filter(s => s.source === activeTab);

        // Sort: favorites first, then by name
        return [...servers].sort((a, b) => {
            const aFav = favorites.includes(a.id) ? 0 : 1;
            const bFav = favorites.includes(b.id) ? 0 : 1;
            return aFav - bFav;
        });
    }, [activeTab, allServers, activationItems, customItems, subItems, favorites]);

    const showTabs = tabs.length > 1;

    // Ping badge helper
    function PingBadge({ ms }) {
        if (ms === undefined || ms === null) {
            return <span className="ping-badge ping-loading">…</span>;
        }
        if (ms < 0) {
            return <span className="ping-badge ping-err">✕</span>;
        }
        const cls = ms < 100 ? 'ping-good' : ms < 200 ? 'ping-ok' : 'ping-slow';
        return <span className={`ping-badge ${cls}`}>{ms} ms</span>;
    }

    // ── Empty state ──
    if (!hasServers && !isAuthenticated) {
        return (
            <div className="server-selector">
                <div className="server-selector-header">
                    <span className="server-selector-title">Servers</span>
                </div>
                <div className="server-empty">
                    <div className="server-empty-icon">📡</div>
                    <div className="server-empty-text">Нет серверов</div>
                    <div className="server-empty-hint">Добавь ключ, подписку или войди через Telegram</div>
                    <button className="server-connect-btn" onClick={onOpenAddServer}>
                        Подключить сервер
                    </button>
                </div>
            </div>
        );
    }

    // ── Normal list with optional tabs ──
    return (
        <div className="server-selector">
            <div className="server-selector-header">
                <span className="server-selector-title">Servers</span>
                <span className="server-count">
                    {subLoading ? '⏳' : filteredServers.length}
                </span>
            </div>

            {/* Subscription tabs */}
            {showTabs && (
                <div className="server-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`server-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                            <span className="server-tab-count">{tab.count}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="server-list">
                {filteredServers.map((server) => {
                    const isFav = favorites.includes(server.id);
                    return (
                        <div
                            key={server.id}
                            className={`server-item ${selectedId === server.id ? 'active' : ''}`}
                            onClick={() => onSelect(server.id)}
                        >
                            <span className="server-flag">{server.flag}</span>
                            <div className="server-info">
                                <div className="server-name">
                                    {server.name}
                                    {server.badge && (
                                        <span className={`server-badge server-badge-${server.badge.toLowerCase()}`}>
                                            {server.badge}
                                        </span>
                                    )}
                                </div>
                                <div className="server-location">{server.location}</div>
                            </div>
                            <PingBadge ms={pings[server.id]} />
                            {onToggleFavorite && (
                                <button
                                    className={`server-fav-btn ${isFav ? 'is-fav' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleFavorite(server.id);
                                    }}
                                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                >
                                    {isFav ? '⭐' : '☆'}
                                </button>
                            )}
                            <span className="server-check">✓</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
