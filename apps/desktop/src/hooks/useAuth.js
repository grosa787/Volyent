/**
 * useAuth — authentication state management hook.
 *
 * Handles:
 * - Listening for deep link auth codes
 * - Exchanging code for token
 * - Storing token in Keychain
 * - Caching user profile in localStorage
 * - Fetching user profile
 * - Sign out
 */

import { useState, useEffect, useCallback } from 'react';
import { exchangeCode, fetchProfile, openTelegramAuth } from '../services/api';

const USER_CACHE_KEY = 'volyent_user_cache';

function getCachedUser() {
    try {
        const raw = localStorage.getItem(USER_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function cacheUser(user) {
    if (user) {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(USER_CACHE_KEY);
    }
}

export function useAuth() {
    // Restore cached user immediately so auth state survives restarts
    const [user, setUser] = useState(() => getCachedUser());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // On mount: check if we have a saved token → fetch profile (refresh cache)
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const token = await window.volyent?.keychain.get('access_token');
                if (token && !cancelled) {
                    try {
                        const profile = await fetchProfile();
                        if (!cancelled) {
                            setUser(profile);
                            cacheUser(profile);
                        }
                    } catch (err) {
                        // Server unreachable — keep cached user, don't wipe auth
                        console.warn('Profile fetch failed, using cache:', err.message);
                    }
                } else if (!token) {
                    // No token — clear everything
                    if (!cancelled) {
                        setUser(null);
                        cacheUser(null);
                    }
                }
            } catch (err) {
                console.error('Auth init failed:', err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        init();
        return () => { cancelled = true; };
    }, []);

    // Listen for deep link auth code
    useEffect(() => {
        if (!window.volyent?.onAuthCode) return;

        const cleanup = window.volyent.onAuthCode(async (code) => {
            try {
                setLoading(true);
                setError(null);
                const result = await exchangeCode(code);

                // Store tokens in Keychain
                await window.volyent.keychain.set('access_token', result.access_token);
                if (result.refresh_token) {
                    await window.volyent.keychain.set('refresh_token', result.refresh_token);
                }

                setUser(result.user);
                cacheUser(result.user);
            } catch (err) {
                setError(err.message);
                console.error('Code exchange failed:', err.message);
            } finally {
                setLoading(false);
            }
        });

        return cleanup;
    }, []);

    const signIn = useCallback(() => {
        openTelegramAuth();
    }, []);

    const signOut = useCallback(async () => {
        await window.volyent?.keychain.delete('access_token');
        await window.volyent?.keychain.delete('refresh_token');
        setUser(null);
        cacheUser(null);
    }, []);

    const refreshProfile = useCallback(async () => {
        try {
            const profile = await fetchProfile();
            setUser(profile);
            cacheUser(profile);
        } catch (err) {
            console.error('Profile refresh failed:', err.message);
        }
    }, []);

    // Derived states
    const isAuthenticated = !!user;
    const isSubscriptionActive = user?.allowed &&
        (!user?.subscription_until || new Date(user.subscription_until) > new Date());

    return {
        user,
        loading,
        error,
        isAuthenticated,
        isSubscriptionActive,
        signIn,
        signOut,
        refreshProfile,
    };
}
