/**
 * useConnection — VPN connection via xray-core.
 *
 * States: DISCONNECTED → CONNECTING → CONNECTED | ERROR
 *
 * Calls window.volyent.vpn.connect/disconnect via IPC
 * which spawns xray-core and sets macOS system proxy.
 */

import { useState, useCallback } from 'react';

export const ConnectionState = {
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    ERROR: 'ERROR',
};

export function useConnection() {
    const [state, setState] = useState(ConnectionState.DISCONNECTED);
    const [ip, setIp] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);

    const connect = useCallback(async (vlessUri) => {
        if (!vlessUri) {
            setErrorMsg('No server selected');
            setState(ConnectionState.ERROR);
            return;
        }
        if (state === ConnectionState.CONNECTING || state === ConnectionState.CONNECTED) return;

        setState(ConnectionState.CONNECTING);
        setErrorMsg(null);
        setIp(null);

        try {
            const result = await window.volyent.vpn.connect(vlessUri);
            if (result.ok) {
                setState(ConnectionState.CONNECTED);
                // Fetch real IP after connecting
                try {
                    const resp = await fetch('https://api.ipify.org?format=json');
                    const data = await resp.json();
                    setIp(data.ip);
                } catch {
                    setIp('Connected');
                }
            } else {
                setErrorMsg(result.error || 'Connection failed');
                setState(ConnectionState.ERROR);
            }
        } catch (err) {
            setErrorMsg(err.message || 'Connection failed');
            setState(ConnectionState.ERROR);
        }
    }, [state]);

    const disconnect = useCallback(async () => {
        try {
            await window.volyent.vpn.disconnect();
        } catch { /* ok */ }
        setState(ConnectionState.DISCONNECTED);
        setIp(null);
        setErrorMsg(null);
    }, []);

    const toggle = useCallback((vlessUri) => {
        if (state === ConnectionState.CONNECTED) {
            disconnect();
        } else if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
            connect(vlessUri);
        }
    }, [state, connect, disconnect]);

    return {
        state,
        ip,
        errorMsg,
        connect,
        disconnect,
        toggle,
    };
}
