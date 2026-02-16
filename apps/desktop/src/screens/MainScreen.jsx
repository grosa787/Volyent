/**
 * MainScreen — the primary VPN interface.
 * Power button, connection timer, IP display, server selector, and subscription overlay.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import PowerButton from '../components/PowerButton';
import ServerSelector from '../components/ServerSelector';
import AddServerModal from '../components/AddServerModal';
import { ConnectionState } from '../hooks/useConnection';

// ── Favorites helpers ──
const FAVORITES_STORAGE = 'volyent_favorites';
function loadFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITES_STORAGE) || '[]'); }
    catch { return []; }
}
function saveFavorites(favs) {
    localStorage.setItem(FAVORITES_STORAGE, JSON.stringify(favs));
}

// ── Timer formatting ──
function formatTimer(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function MainScreen({
    connectionState,
    ip,
    errorMsg,
    isAuthenticated,
    isSubscriptionActive,
    onToggle,
    onSwitchServer,
    onOpenSettings,
    customKeys,
    subServers,
    subscriptions,
    subLoading,
    activationKeys,
    onSignIn,
    onAddKey,
    onAddSubscription,
}) {
    const [selectedServer, setSelectedServer] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [favorites, setFavorites] = useState(loadFavorites);

    // ── Connection timer ──
    const [timerSeconds, setTimerSeconds] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        if (connectionState === ConnectionState.CONNECTED) {
            setTimerSeconds(0);
            timerRef.current = setInterval(() => {
                setTimerSeconds(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            if (connectionState === ConnectionState.DISCONNECTED) {
                setTimerSeconds(0);
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [connectionState]);

    // Build a lookup of server id → VLESS URI
    const allServers = useMemo(() => {
        const keys = customKeys.map(k => ({ id: k.id, uri: k.uri }));
        const subs = subServers.map(s => ({ id: s.id, uri: s.uri }));
        const acts = (activationKeys || []).map(a => ({ id: a.id, uri: a.uri }));
        return [...keys, ...subs, ...acts];
    }, [customKeys, subServers, activationKeys]);

    // Handle server selection — auto-switch if connected
    const handleSelectServer = (serverId) => {
        setSelectedServer(serverId);
        if (connectionState === ConnectionState.CONNECTED && serverId !== selectedServer) {
            const newUri = allServers.find(s => s.id === serverId)?.uri;
            if (newUri && onSwitchServer) {
                onSwitchServer(newUri);
            }
        }
    };

    // Auto-select first server if none selected
    const effectiveSelected = selectedServer && allServers.find(s => s.id === selectedServer)
        ? selectedServer
        : (allServers.length > 0 ? allServers[0].id : null);

    // Find the URI of the selected server
    const selectedUri = allServers.find(s => s.id === effectiveSelected)?.uri || null;

    const hasServers = allServers.length > 0;

    const statusText =
        connectionState === ConnectionState.CONNECTED ? 'Connected' :
            connectionState === ConnectionState.CONNECTING ? 'Connecting…' :
                connectionState === ConnectionState.ERROR ? (errorMsg || 'Error') :
                    'Disconnected';

    const statusClass =
        connectionState === ConnectionState.CONNECTED ? 'connected' :
            connectionState === ConnectionState.CONNECTING ? 'connecting' :
                connectionState === ConnectionState.ERROR ? 'error' : '';

    const ipDisplay =
        connectionState === ConnectionState.CONNECTED && ip ? `IP: ${ip}` :
            connectionState === ConnectionState.CONNECTING ? 'IP: …' :
                'IP: —';

    const isDisabled = !hasServers;

    const handleToggle = () => {
        onToggle(selectedUri);
    };

    // ── Favorite handlers ──
    const handleToggleFavorite = (serverId) => {
        setFavorites(prev => {
            const updated = prev.includes(serverId)
                ? prev.filter(id => id !== serverId)
                : [...prev, serverId];
            saveFavorites(updated);
            return updated;
        });
    };

    return (
        <div className="main-screen fade-in">
            {/* Header */}
            <div className="main-header">
                <span className="app-title">Volyent</span>
                <button className="settings-btn" onClick={onOpenSettings} title="Settings">
                    ⚙
                </button>
            </div>

            {/* Connection timer (above power button) */}
            {connectionState === ConnectionState.CONNECTED && (
                <div className="connection-timer fade-in">
                    {formatTimer(timerSeconds)}
                </div>
            )}

            {/* Power button + IP */}
            <div className="power-section">
                <PowerButton
                    state={connectionState}
                    disabled={isDisabled}
                    onToggle={handleToggle}
                />
                <div className="ip-section">
                    <div className="ip-address">{ipDisplay}</div>
                    <div className={`connection-status ${statusClass}`}>
                        Status: {statusText}
                    </div>
                </div>
            </div>

            {/* Server selector with favorites */}
            <ServerSelector
                selectedId={effectiveSelected}
                onSelect={handleSelectServer}
                customKeys={customKeys}
                subServers={subServers}
                subscriptions={subscriptions}
                subLoading={subLoading}
                activationKeys={activationKeys}
                isAuthenticated={isAuthenticated}
                onOpenAddServer={() => setShowAddModal(true)}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
            />

            {/* Subscription expired overlay */}
            {isAuthenticated && !isSubscriptionActive && (
                <div className="expired-overlay fade-in">
                    <span className="expired-text">Subscription expired</span>
                    <button
                        className="renew-btn"
                        onClick={() => window.volyent?.openExternal('https://volyent.com/renew')}
                    >
                        Renew subscription
                    </button>
                </div>
            )}

            {/* Add Server Modal */}
            {showAddModal && (
                <AddServerModal
                    onClose={() => setShowAddModal(false)}
                    onAddKey={onAddKey}
                    onAddSubscription={onAddSubscription}
                    onSignIn={onSignIn}
                />
            )}
        </div>
    );
}
