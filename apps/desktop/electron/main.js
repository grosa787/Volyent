/**
 * Volyent — Electron main process.
 *
 * Responsibilities:
 * - Create the main BrowserWindow (dark, 400×650)
 * - System tray icon with quick connect/disconnect
 * - Register volyent:// deep link protocol
 * - Handle incoming deep link URLs → IPC to renderer
 * - IPC handlers for Keychain (keytar) operations
 * - Auto-launch at login support
 */

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const keytar = require('keytar');
const XrayManager = require('./xray-manager');

const xray = new XrayManager();

const KEYCHAIN_SERVICE = 'com.volyent.app';
const PROTOCOL = 'volyent';

// Prevent multiple instances — single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Track VPN status for tray
let vpnStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'

// ---------------------------------------------------------------------------
// Deep link protocol registration
// ---------------------------------------------------------------------------

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
            path.resolve(process.argv[1]),
        ]);
    }
} else {
    app.setAsDefaultProtocolClient(PROTOCOL);
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 680,
        minWidth: 380,
        maxWidth: 450,
        minHeight: 600,
        resizable: true,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 12, y: 12 },
        backgroundColor: '#0a0a12',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Dev or production
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
        mainWindow.loadURL(devUrl);
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    // Minimize to tray on close instead of quitting
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ---------------------------------------------------------------------------
// System Tray
// ---------------------------------------------------------------------------

function createTray() {
    const isDev = !!process.env.VITE_DEV_SERVER_URL;
    let iconPath;
    if (isDev) {
        iconPath = path.join(__dirname, '..', 'assets', 'trayTemplate.png');
    } else {
        // In packaged app, use app.asar.unpacked
        iconPath = path.join(process.resourcesPath, 'assets', 'trayTemplate.png');
    }

    // Fallback to the iconset icon if tray template doesn't exist
    const fs = require('fs');
    if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, '..', 'assets', 'trayTemplate.png');
    }

    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);

    tray = new Tray(icon);
    tray.setToolTip('Volyent VPN');
    updateTrayMenu();

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.focus();
            } else {
                mainWindow.show();
            }
        } else {
            createWindow();
        }
    });
}

function updateTrayMenu() {
    if (!tray) return;

    const statusText =
        vpnStatus === 'connected' ? '✅ Connected' :
            vpnStatus === 'connecting' ? '⏳ Connecting…' :
                '❌ Disconnected';

    const connectLabel = vpnStatus === 'connected' ? 'Disconnect' : 'Quick Connect';
    const connectAction = vpnStatus === 'connected'
        ? () => { xray.disconnect(); setVpnStatus('disconnected'); }
        : () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } };

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Volyent VPN', enabled: false },
        { type: 'separator' },
        { label: statusText, enabled: false },
        { label: connectLabel, click: connectAction },
        { type: 'separator' },
        {
            label: 'Show Window',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    createWindow();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit Volyent',
            click: () => {
                isQuitting = true;
                xray.disconnect();
                app.quit();
            }
        },
    ]);

    tray.setContextMenu(contextMenu);

    // Update tooltip
    tray.setToolTip(`Volyent VPN — ${statusText}`);
}

function setVpnStatus(status) {
    vpnStatus = status;
    updateTrayMenu();
    // Notify renderer of status change
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('vpn:statusChanged', status);
    }
}

// ---------------------------------------------------------------------------
// Deep link handling
// ---------------------------------------------------------------------------

function handleDeepLink(url) {
    if (!url || !mainWindow) return;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === `${PROTOCOL}:` && parsed.hostname === 'auth') {
            const code = parsed.searchParams.get('code');
            if (code && mainWindow) {
                mainWindow.webContents.send('auth:code', code);
                mainWindow.show();
                mainWindow.focus();
            }
        }
    } catch (err) {
        console.error('Failed to parse deep link URL:', err.message);
    }
}

// macOS: open-url event
app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});

// Second instance → forward URL
app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
});

// ---------------------------------------------------------------------------
// IPC: Keychain operations
// ---------------------------------------------------------------------------

ipcMain.handle('keychain:get', async (_event, key) => {
    try {
        return await keytar.getPassword(KEYCHAIN_SERVICE, key);
    } catch {
        return null;
    }
});

ipcMain.handle('keychain:set', async (_event, key, value) => {
    await keytar.setPassword(KEYCHAIN_SERVICE, key, value);
    return true;
});

ipcMain.handle('keychain:delete', async (_event, key) => {
    try {
        await keytar.deletePassword(KEYCHAIN_SERVICE, key);
        return true;
    } catch {
        return false;
    }
});

// IPC: Open external URL
ipcMain.handle('shell:openExternal', async (_event, url) => {
    await shell.openExternal(url);
    return true;
});

// IPC: Fetch URL from main process (bypasses CORS)
ipcMain.handle('net:fetch', async (_event, url) => {
    const doFetch = (targetUrl, redirects = 0) => {
        if (redirects > 5) return Promise.resolve({ ok: false, text: '', error: 'Too many redirects' });
        const mod = targetUrl.startsWith('https') ? require('https') : require('http');
        return new Promise((resolve) => {
            const req = mod.get(targetUrl, { headers: { 'User-Agent': 'Volyent/1.0' } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    doFetch(res.headers.location, redirects + 1).then(resolve);
                    return;
                }
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve({ ok: res.statusCode < 400, text: data }));
            });
            req.on('error', (e) => resolve({ ok: false, text: '', error: e.message }));
            req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, text: '', error: 'Timeout' }); });
        });
    };
    try {
        return await doFetch(url);
    } catch (err) {
        return { ok: false, text: '', error: err.message };
    }
});

// IPC: Ping host via TCP connection time
ipcMain.handle('net:ping', async (_event, host, port) => {
    const net = require('net');
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        socket.setTimeout(3000);
        socket.connect(port || 443, host, () => {
            const ms = Date.now() - start;
            socket.destroy();
            resolve({ ok: true, ms });
        });
        socket.on('error', () => {
            socket.destroy();
            resolve({ ok: false, ms: -1 });
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve({ ok: false, ms: -1 });
        });
    });
});

// ---------------------------------------------------------------------------
// IPC: VPN (xray-core) — with tray status updates
// ---------------------------------------------------------------------------

ipcMain.handle('vpn:connect', async (_event, vlessUri) => {
    setVpnStatus('connecting');
    const result = await xray.connect(vlessUri);
    setVpnStatus(result.ok ? 'connected' : 'disconnected');
    return result;
});

ipcMain.handle('vpn:disconnect', async () => {
    const result = xray.disconnect();
    setVpnStatus('disconnected');
    return result;
});

ipcMain.handle('vpn:status', async () => {
    return xray.getStatus();
});

ipcMain.handle('vpn:stats', async () => {
    return await xray.getTrafficStats();
});

// IPC: App version
ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
});

// ---------------------------------------------------------------------------
// IPC: Auto-launch at login
// ---------------------------------------------------------------------------

ipcMain.handle('app:getAutoLaunch', () => {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
});

ipcMain.handle('app:setAutoLaunch', (_event, enabled) => {
    app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true,
    });
    return true;
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    // On macOS, keep running in tray (don't quit)
    // Only quit if isQuitting flag is set
});

app.on('before-quit', () => {
    isQuitting = true;
    xray.disconnect();
});

app.on('activate', () => {
    if (mainWindow) {
        mainWindow.show();
    } else if (app.isReady()) {
        createWindow();
    }
});
