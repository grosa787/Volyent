/**
 * XrayManager — manages xray-core process and macOS system proxy.
 *
 * Flow:
 * 1. Generate xray config from VLESS URI
 * 2. Spawn xray-core as child process
 * 3. Set macOS system SOCKS proxy → 127.0.0.1:10808
 * 4. On disconnect: kill process, unset proxy
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SOCKS_PORT = 10808;
const HTTP_PORT = 10809;
const API_PORT = 10085;
const CONFIG_PATH = path.join(os.tmpdir(), 'volyent-xray-config.json');
const STATS_PATH = path.join(os.tmpdir(), 'volyent-traffic-stats.json');

class XrayManager {
    constructor() {
        this.process = null;
        this.status = 'disconnected';
        this.error = null;
        this.activeNetworkService = null;
        // Cumulative traffic stats (persist across reconnects)
        this.cumulativeStats = this._loadStats();
    }

    _loadStats() {
        try {
            if (fs.existsSync(STATS_PATH)) {
                return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
            }
        } catch { /* ok */ }
        return { uplink: 0, downlink: 0 };
    }

    _saveStats() {
        try {
            fs.writeFileSync(STATS_PATH, JSON.stringify(this.cumulativeStats));
        } catch { /* ok */ }
    }

    /**
     * Get the path to the xray binary.
     * In packaged app it's inside app.asar.unpacked/
     */
    getXrayPath() {
        // Packaged app — asar.unpacked (must check FIRST, because
        // Electron's fs.existsSync sees files inside asar but spawn can't use them)
        const asarUnpackedPath = __dirname.replace('app.asar', 'app.asar.unpacked');
        const prodPath = path.join(asarUnpackedPath, 'bin', 'xray');
        if (fs.existsSync(prodPath)) return prodPath;

        // Development (no asar)
        const devPath = path.join(__dirname, 'bin', 'xray');
        if (fs.existsSync(devPath)) return devPath;

        throw new Error('xray binary not found');
    }

    /**
     * Parse a VLESS URI into xray outbound config.
     */
    parseVlessUri(uri) {
        // vless://uuid@host:port?type=tcp&security=tls&...#label
        const url = new URL(uri);
        const uuid = url.username;
        const host = url.hostname;
        const port = parseInt(url.port, 10);
        const params = Object.fromEntries(url.searchParams);
        const label = decodeURIComponent(url.hash.slice(1) || 'Volyent');

        const streamSettings = {
            network: params.type || 'tcp',
        };

        // TLS / Reality
        if (params.security === 'tls') {
            streamSettings.security = 'tls';
            streamSettings.tlsSettings = {
                serverName: params.sni || host,
                allowInsecure: false,
                fingerprint: params.fp || 'chrome',
            };
            if (params.alpn) {
                streamSettings.tlsSettings.alpn = params.alpn.split(',');
            }
        } else if (params.security === 'reality') {
            streamSettings.security = 'reality';
            streamSettings.realitySettings = {
                serverName: params.sni || '',
                fingerprint: params.fp || 'chrome',
                publicKey: params.pbk || '',
                shortId: params.sid || '',
                spiderX: params.spx || '',
            };
        }

        // Transport
        if (streamSettings.network === 'ws') {
            streamSettings.wsSettings = {
                path: params.path || '/',
                headers: { Host: params.host || host },
            };
        } else if (streamSettings.network === 'grpc') {
            streamSettings.grpcSettings = {
                serviceName: params.serviceName || '',
            };
        } else if (streamSettings.network === 'tcp' && params.headerType === 'http') {
            streamSettings.tcpSettings = {
                header: {
                    type: 'http',
                    request: {
                        path: [params.path || '/'],
                        headers: { Host: [params.host || host] },
                    },
                },
            };
        }

        const user = {
            id: uuid,
            encryption: params.encryption || 'none',
        };
        // Only add flow if specified (empty string causes xray error)
        if (params.flow) {
            user.flow = params.flow;
        }

        return {
            label,
            outbound: {
                tag: 'proxy',
                protocol: 'vless',
                settings: {
                    vnext: [{
                        address: host,
                        port,
                        users: [user],
                    }],
                },
                streamSettings,
            },
        };
    }

    /**
     * Generate full xray config JSON.
     */
    generateConfig(vlessUri) {
        const { outbound } = this.parseVlessUri(vlessUri);

        const config = {
            log: { loglevel: 'warning' },
            stats: {},
            api: {
                tag: 'api',
                services: ['StatsService'],
            },
            policy: {
                system: {
                    statsInboundUplink: true,
                    statsInboundDownlink: true,
                    statsOutboundUplink: true,
                    statsOutboundDownlink: true,
                },
            },
            inbounds: [
                {
                    tag: 'socks-in',
                    protocol: 'socks',
                    listen: '127.0.0.1',
                    port: SOCKS_PORT,
                    settings: {
                        auth: 'noauth',
                        udp: true,
                    },
                },
                {
                    tag: 'http-in',
                    protocol: 'http',
                    listen: '127.0.0.1',
                    port: HTTP_PORT,
                    settings: {},
                },
                {
                    tag: 'api',
                    protocol: 'dokodemo-door',
                    listen: '127.0.0.1',
                    port: API_PORT,
                    settings: {
                        address: '127.0.0.1',
                    },
                },
            ],
            outbounds: [
                outbound,
                { tag: 'direct', protocol: 'freedom' },
                { tag: 'block', protocol: 'blackhole' },
            ],
            routing: {
                domainStrategy: 'AsIs',
                rules: [
                    {
                        type: 'field',
                        inboundTag: ['api'],
                        outboundTag: 'api',
                    },
                    {
                        type: 'field',
                        outboundTag: 'direct',
                        ip: [
                            '10.0.0.0/8',
                            '172.16.0.0/12',
                            '192.168.0.0/16',
                            '127.0.0.0/8',
                        ],
                    },
                ],
            },
        };

        return config;
    }

    /**
     * Get the active macOS network service name (e.g., "Wi-Fi").
     */
    getActiveNetworkService() {
        try {
            // Get the primary interface
            const route = execSync("route -n get default 2>/dev/null | grep interface | awk '{print $2}'", { encoding: 'utf8' }).trim();
            if (!route) return 'Wi-Fi';

            // Map interface to service name
            const services = execSync('networksetup -listallhardwareports', { encoding: 'utf8' });
            const lines = services.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('Device:') && lines[i].includes(route)) {
                    // Service name is the line before
                    for (let j = i - 1; j >= 0; j--) {
                        if (lines[j].startsWith('Hardware Port:')) {
                            return lines[j].replace('Hardware Port:', '').trim();
                        }
                    }
                }
            }
            return 'Wi-Fi';
        } catch {
            return 'Wi-Fi';
        }
    }

    /**
     * Set macOS system SOCKS proxy.
     */
    setSystemProxy() {
        try {
            this.activeNetworkService = this.getActiveNetworkService();
            const svc = `"${this.activeNetworkService}"`;

            execSync(`networksetup -setsocksfirewallproxy ${svc} 127.0.0.1 ${SOCKS_PORT}`, { encoding: 'utf8' });
            execSync(`networksetup -setsocksfirewallproxystate ${svc} on`, { encoding: 'utf8' });

            // Also set HTTP/HTTPS proxy for broader coverage
            execSync(`networksetup -setwebproxy ${svc} 127.0.0.1 ${HTTP_PORT}`, { encoding: 'utf8' });
            execSync(`networksetup -setwebproxystate ${svc} on`, { encoding: 'utf8' });
            execSync(`networksetup -setsecurewebproxy ${svc} 127.0.0.1 ${HTTP_PORT}`, { encoding: 'utf8' });
            execSync(`networksetup -setsecurewebproxystate ${svc} on`, { encoding: 'utf8' });

            return true;
        } catch (err) {
            console.error('Failed to set system proxy:', err.message);
            return false;
        }
    }

    /**
     * Unset macOS system proxy.
     */
    unsetSystemProxy() {
        try {
            const svc = `"${this.activeNetworkService || 'Wi-Fi'}"`;

            execSync(`networksetup -setsocksfirewallproxystate ${svc} off`, { encoding: 'utf8' });
            execSync(`networksetup -setwebproxystate ${svc} off`, { encoding: 'utf8' });
            execSync(`networksetup -setsecurewebproxystate ${svc} off`, { encoding: 'utf8' });
        } catch (err) {
            console.error('Failed to unset system proxy:', err.message);
        }
    }

    /**
     * Connect to a VLESS server.
     */
    async connect(vlessUri) {
        if (this.process) {
            this.disconnect();
        }

        this.status = 'connecting';
        this.error = null;

        try {
            // 1. Generate config
            const config = this.generateConfig(vlessUri);
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

            // 2. Start xray-core
            const xrayPath = this.getXrayPath();
            this.process = spawn(xrayPath, ['run', '-config', CONFIG_PATH], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            // Wait for xray to start (check stdout for readiness)
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => resolve(), 3000); // Max 3s wait
                let outputBuf = '';

                this.process.stdout.on('data', (data) => {
                    const msg = data.toString();
                    outputBuf += msg;
                    console.log('[xray]', msg.trim());
                    if (msg.includes('started') || msg.includes('listening')) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });

                this.process.stderr.on('data', (data) => {
                    const msg = data.toString();
                    outputBuf += msg;
                    console.error('[xray err]', msg.trim());
                });

                this.process.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(new Error(`xray spawn error: ${err.message}`));
                });

                this.process.on('exit', (code) => {
                    if (code !== 0 && this.status === 'connecting') {
                        clearTimeout(timeout);
                        // Extract meaningful part from output
                        const failMatch = outputBuf.match(/Failed to start:(.+)/);
                        const errMsg = failMatch ? failMatch[1].trim().slice(0, 150) : outputBuf.slice(0, 200);
                        reject(new Error(`xray error: ${errMsg}`));
                    }
                });
            });

            // 3. Set system proxy
            this.setSystemProxy();

            this.status = 'connected';
            return { ok: true };
        } catch (err) {
            this.status = 'error';
            this.error = err.message;
            this.cleanup();
            return { ok: false, error: err.message };
        }
    }

    /**
     * Disconnect.
     */
    disconnect() {
        this.cleanup();
        this.status = 'disconnected';
        this.error = null;
        return { ok: true };
    }

    /**
     * Internal cleanup.
     */
    cleanup() {
        // Save session stats before killing
        if (this.process && this.status === 'connected') {
            this._saveCumulativeFromSession();
        }

        // Kill xray process
        if (this.process) {
            try {
                this.process.kill('SIGTERM');
            } catch { /* already dead */ }
            this.process = null;
        }

        // Remove system proxy
        this.unsetSystemProxy();

        // Remove config
        try { fs.unlinkSync(CONFIG_PATH); } catch { /* ok */ }
    }

    /**
     * Get current status.
     */
    getStatus() {
        return {
            status: this.status,
            error: this.error,
        };
    }

    /**
     * Query real traffic stats from xray API.
     */
    async getTrafficStats() {
        const stats = { ...this.cumulativeStats };

        if (this.status !== 'connected' || !this.process) {
            return stats;
        }

        try {
            const xrayPath = this.getXrayPath();
            const queryStats = (pattern) => {
                try {
                    const result = execSync(
                        `"${xrayPath}" api statsquery --server=127.0.0.1:${API_PORT} -pattern "${pattern}"`,
                        { encoding: 'utf8', timeout: 2000 }
                    );
                    // Parse the JSON output and sum all values
                    const data = JSON.parse(result);
                    if (data.stat) {
                        return data.stat.reduce((sum, s) => sum + (parseInt(s.value, 10) || 0), 0);
                    }
                    return 0;
                } catch {
                    return 0;
                }
            };

            const sessionUp = queryStats('uplink');
            const sessionDown = queryStats('downlink');

            stats.sessionUplink = sessionUp;
            stats.sessionDownlink = sessionDown;
            stats.uplink = this.cumulativeStats.uplink + sessionUp;
            stats.downlink = this.cumulativeStats.downlink + sessionDown;
        } catch { /* ok */ }

        return stats;
    }

    /**
     * Save session stats to cumulative before disconnect.
     */
    _saveCumulativeFromSession() {
        try {
            const xrayPath = this.getXrayPath();
            const queryStats = (pattern) => {
                try {
                    const result = execSync(
                        `"${xrayPath}" api statsquery --server=127.0.0.1:${API_PORT} -pattern "${pattern}"`,
                        { encoding: 'utf8', timeout: 2000 }
                    );
                    const data = JSON.parse(result);
                    if (data.stat) {
                        return data.stat.reduce((sum, s) => sum + (parseInt(s.value, 10) || 0), 0);
                    }
                    return 0;
                } catch {
                    return 0;
                }
            };

            this.cumulativeStats.uplink += queryStats('uplink');
            this.cumulativeStats.downlink += queryStats('downlink');
            this._saveStats();
        } catch { /* ok */ }
    }
}

module.exports = XrayManager;
