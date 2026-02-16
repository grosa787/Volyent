/**
 * Preload script — exposes safe IPC bridge to renderer.
 * Uses contextBridge for security (contextIsolation: true).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('volyent', {
    // Keychain
    keychain: {
        get: (key) => ipcRenderer.invoke('keychain:get', key),
        set: (key, value) => ipcRenderer.invoke('keychain:set', key, value),
        delete: (key) => ipcRenderer.invoke('keychain:delete', key),
    },

    // Shell
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

    // Fetch URL (via main process, no CORS)
    fetchUrl: (url) => ipcRenderer.invoke('net:fetch', url),

    // VPN (xray-core)
    vpn: {
        connect: (vlessUri) => ipcRenderer.invoke('vpn:connect', vlessUri),
        disconnect: () => ipcRenderer.invoke('vpn:disconnect'),
        status: () => ipcRenderer.invoke('vpn:status'),
        stats: () => ipcRenderer.invoke('vpn:stats'),
    },

    // Ping (TCP connection time)
    ping: (host, port) => ipcRenderer.invoke('net:ping', host, port),

    // App version
    getVersion: () => ipcRenderer.invoke('app:getVersion'),

    // Auto-launch at login
    getAutoLaunch: () => ipcRenderer.invoke('app:getAutoLaunch'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),

    // Auth deep link listener
    onAuthCode: (callback) => {
        const handler = (_event, code) => callback(code);
        ipcRenderer.on('auth:code', handler);
        return () => ipcRenderer.removeListener('auth:code', handler);
    },

    // VPN status change listener (from tray actions)
    onVpnStatusChanged: (callback) => {
        const handler = (_event, status) => callback(status);
        ipcRenderer.on('vpn:statusChanged', handler);
        return () => ipcRenderer.removeListener('vpn:statusChanged', handler);
    },
});
