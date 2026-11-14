const { app, BrowserWindow, BrowserView, ipcMain, nativeImage, shell, powerSaveBlocker, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

// ==========================================================
// 🌐 SMART GITHUB INSTANT AUTO-UPDATE CONFIG (ZERO DELAY)
// ==========================================================
const GITHUB_OWNER = "mdasaduzzamanbabu2001-glitch";
const GITHUB_REPO = "pixelcut-pro";
const DEFAULT_UPDATE_REPO_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main`;

// ==========================================================
// 📂 CUSTOM OUTPUT FOLDER SETTING
// ==========================================================
const CUSTOM_OUTPUT_FOLDER = "";

const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');
const WORK_TEMP_DIR = path.join(app.getPath('userData'), 'pixelcut_temp_work');
const SAVED_KEY_FILE = path.join(DESKTOP_PATH, 'gemini_api_key.txt');
const DEFAULT_GEMINI_KEY = "AIzaSyC80w5GGuxs9akysrKAGCwH6gw9-lMvraY";

if (!fs.existsSync(WORK_TEMP_DIR)) {
    fs.mkdirSync(WORK_TEMP_DIR, { recursive: true });
}

function getOutputFolder() {
    const targetDir = CUSTOM_OUTPUT_FOLDER && CUSTOM_OUTPUT_FOLDER.trim() !== ""
        ? CUSTOM_OUTPUT_FOLDER.trim()
        : app.getPath('downloads');

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    return targetDir;
}

// ==========================================================
// 🛡️ GOOGLE LOGIN SHIELD + ANTI-MINIMIZE THROTTLING FLAGS
// ==========================================================
process.on('unhandledRejection', (reason) => {
    if (reason && (reason.code === 'ERR_ABORTED' || String(reason).includes('(-3)'))) return;
    console.error("Unhandled Rejection:", reason);
});

const RAW_CHROME_VER = process.versions.chrome || '124.0.6367.243';
const CHROME_MAJOR = RAW_CHROME_VER.split('.')[0] || '124';
const CHROME_FULL_VERSION = RAW_CHROME_VER;

// 🔥 CRITICAL: NEVER overwrite app.userAgentFallback globally!
// Keep genuine untouched Electron UA for Google OAuth popups so Google NEVER triggers "This browser or app may not be secure".
const NATIVE_ELECTRON_UA = (app.userAgentFallback && app.userAgentFallback.includes('Electron/'))
    ? app.userAgentFallback
    : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${app.getName()}/${app.getVersion()} Chrome/${RAW_CHROME_VER} Electron/${process.versions.electron} Safari/537.36`;

const CLEAN_CHROMIUM_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;
const FIREFOX_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0`;

// Disable Blink AutomationControlled & FedCM (keep WebAuthentication ENABLED for 2FA/Passkeys!)
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch(
    'disable-features',
    'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,ThrottleDisplayNoneAndVisibilityHiddenCrossOriginIframes,FedCm,FedCmAuthz'
);
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-ipc-flooding-protection');
app.commandLine.appendSwitch('disable-hang-monitor');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('log-level', '3');

if (process.platform === 'win32') {
    app.setAppUserModelId("com.pixelcut.pro");
}

let mainWindow;
let view;
let isViewVisible = false;
let isAutomationRunning = false;
let isViewInGoogleLoginMode = false;
let currentActiveIndex = 0;
let currentOriginalName = 'Image';
let downloadDoneResolver = null;
let lastValidWindowSize = [1050, 780];
let powerBlockerId = null;

// Track OAuth popup WebContents cleanly without desyncing headers
const oauthPopupIds = new Set();
const firefoxFallbackPopupIds = new Set();

// Auto-update state
let autoUpdateTimer = null;
let isCheckingUpdate = false;
let lastCheckedSha = null;
let lastAutoPromptedVersion = null;
let cachedSubfolderPrefix = '';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function isGoogleAuthHost(urlStr) {
    try {
        const host = new URL(urlStr).hostname.toLowerCase();
        return (
            host === 'accounts.google.com' ||
            host.endsWith('.accounts.google.com') ||
            host === 'accounts.youtube.com' ||
            host === 'myaccount.google.com' ||
            host === 'gds.google.com'
        );
    } catch (e) {
        return false;
    }
}

function isGoogleDomainHost(urlStr) {
    try {
        const host = new URL(urlStr).hostname.toLowerCase();
        return (
            host === 'google.com' ||
            host.endsWith('.google.com') ||
            host === 'gstatic.com' ||
            host.endsWith('.gstatic.com') ||
            host === 'googleusercontent.com' ||
            host.endsWith('.googleusercontent.com') ||
            host === 'youtube.com' ||
            host.endsWith('.youtube.com')
        );
    } catch (e) {
        return false;
    }
}

// ==========================================================
// 🔄 ZERO-DELAY SMART GITHUB AUTO-UPDATE ENGINE (AUTO-POPUP!)
// ==========================================================
function getLocalPackageJson() {
    try {
        const pkgPath = path.join(__dirname, 'package.json');
        return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch (e) {
        return { version: app.getVersion() || '1.0.0', updateRepoUrl: DEFAULT_UPDATE_REPO_URL };
    }
}

function extractOwnerRepo() {
    try {
        const pkg = getLocalPackageJson();
        const rawUrl = (pkg.updateRepoUrl || DEFAULT_UPDATE_REPO_URL || '').trim();
        const m = rawUrl.match(/github(?:usercontent)?\.com\/([^\/]+)\/([^\/]+)/i);
        if (m && m[1] && m[2] && !m[1].includes('YOUR_GITHUB')) {
            return { owner: m[1], repo: m[2].replace(/\.git$/i, '') };
        }
    } catch (e) {}
    return { owner: GITHUB_OWNER, repo: GITHUB_REPO };
}

function isNewerVersion(localVer, remoteVer) {
    if (!localVer || !remoteVer) return false;
    const p1 = String(localVer).replace(/[^0-9.]/g, '').split('.').map(Number);
    const p2 = String(remoteVer).replace(/[^0-9.]/g, '').split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n2 > n1) return true;
        if (n2 < n1) return false;
    }
    return false;
}

function httpsGetBuffer(urlStr, extraHeaders = {}, timeoutMs = 12000, redirectLeft = 3) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const opts = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
                'User-Agent': CLEAN_CHROMIUM_UA,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                ...extraHeaders
            },
            timeout: timeoutMs
        };

        const req = https.request(opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectLeft > 0) {
                const nextUrl = new URL(res.headers.location, urlStr).toString();
                res.resume();
                return httpsGetBuffer(nextUrl, extraHeaders, timeoutMs, redirectLeft - 1).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(buffer);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Update check timeout')); });
        req.end();
    });
}

function parseGitPktLinesForHeadSha(buf) {
    let i = 0;
    const refs = {};
    while (i + 4 <= buf.length) {
        const lenHex = buf.subarray(i, i + 4).toString('ascii');
        const len = parseInt(lenHex, 16);
        if (isNaN(len)) break;
        if (len === 0) {
            i += 4;
            continue;
        }
        if (len < 4 || i + len > buf.length) break;
        const payload = buf.subarray(i + 4, i + len).toString('utf8');
        i += len;
        if (payload.startsWith('#')) continue;
        const clean = payload.split('\0')[0].trim();
        const spaceIdx = clean.search(/\s+/);
        if (spaceIdx === -1) continue;
        const sha = clean.slice(0, spaceIdx).trim();
        const refName = clean.slice(spaceIdx).trim();
        if (/^[0-9a-f]{40}$/i.test(sha) && refName) {
            refs[refName] = sha;
        }
    }
    return refs['refs/heads/main'] || refs['refs/heads/master'] || refs['HEAD'] || null;
}

async function getLatestCommitSha(owner, repo) {
    try {
        const buf = await httpsGetBuffer(
            `https://github.com/${owner}/${repo}.git/info/refs?service=git-upload-pack`,
            { 'User-Agent': 'git/2.43.0', 'Accept': '*/*' },
            10000
        );
        return parseGitPktLinesForHeadSha(buf);
    } catch (e) {
        return null;
    }
}

async function fetchFileFromGitHub(fileName, commitSha = null) {
    const { owner, repo } = extractOwnerRepo();

    if (commitSha) {
        try {
            const buf = await httpsGetBuffer(
                `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${cachedSubfolderPrefix}${fileName}`
            );
            return buf.toString('utf8');
        } catch (e) {}

        if (cachedSubfolderPrefix) {
            try {
                const buf = await httpsGetBuffer(
                    `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${fileName}`
                );
                cachedSubfolderPrefix = '';
                return buf.toString('utf8');
            } catch (e) {}
        }
    }

    for (const branch of ['main', 'master']) {
        try {
            const buf = await httpsGetBuffer(
                `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cachedSubfolderPrefix}${fileName}?cb=${Date.now()}`
            );
            return buf.toString('utf8');
        } catch (e) {}
    }

    try {
        const refQuery = commitSha ? `?ref=${commitSha}` : '';
        const rootBuf = await httpsGetBuffer(
            `https://api.github.com/repos/${owner}/${repo}/contents${refQuery}`,
            { 'Accept': 'application/vnd.github.v3+json' }
        );
        const items = JSON.parse(rootBuf.toString('utf8'));
        if (Array.isArray(items)) {
            const directMatch = items.find(it => it.name && it.name.toLowerCase() === fileName.toLowerCase() && it.download_url);
            if (directMatch) {
                cachedSubfolderPrefix = '';
                const fBuf = await httpsGetBuffer(directMatch.download_url);
                return fBuf.toString('utf8');
            }
            const dirs = items.filter(it => it.type === 'dir' && it.url);
            for (const d of dirs) {
                const subBuf = await httpsGetBuffer(d.url, { 'Accept': 'application/vnd.github.v3+json' });
                const subItems = JSON.parse(subBuf.toString('utf8'));
                if (Array.isArray(subItems)) {
                    const subMatch = subItems.find(it => it.name && it.name.toLowerCase() === fileName.toLowerCase() && it.download_url);
                    if (subMatch) {
                        cachedSubfolderPrefix = d.path ? `${d.path.replace(/^\/+|\/+$/g, '')}/` : '';
                        const fBuf = await httpsGetBuffer(subMatch.download_url);
                        return fBuf.toString('utf8');
                    }
                }
            }
        }
        throw new Error(`File '${fileName}' not found in GitHub repo '${repo}'!`);
    } catch (apiErr) {
        if (String(apiErr.message).includes('404')) {
            throw new Error(`GitHub Repo '${owner}/${repo}' is Private or Not Found! Make it Public.`);
        }
        throw apiErr;
    }
}

async function checkOnlineUpdate(isManual = false) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!isManual && isAutomationRunning) return;
    if (isCheckingUpdate) return;

    isCheckingUpdate = true;
    try {
        const { owner, repo } = extractOwnerRepo();
        const localPkg = getLocalPackageJson();
        const localVersion = localPkg.version || '1.0.0';

        const liveSha = await getLatestCommitSha(owner, repo);

        if (!isManual && liveSha && liveSha === lastCheckedSha) {
            return;
        }

        const remotePkgRaw = await fetchFileFromGitHub('package.json', liveSha);
        const remotePkg = JSON.parse(remotePkgRaw);
        const remoteVersion = remotePkg.version || '1.0.0';

        if (liveSha) {
            lastCheckedSha = liveSha;
        }

        if (isNewerVersion(localVersion, remoteVersion)) {
            if (isManual || lastAutoPromptedVersion !== remoteVersion) {
                lastAutoPromptedVersion = remoteVersion;
                mainWindow.webContents.send('update-available', {
                    currentVersion: localVersion,
                    newVersion: remoteVersion,
                    notes: remotePkg.updateNotes || `✨ Version ${remoteVersion} is now available with latest improvements!`
                });
            }
        } else if (isManual) {
            mainWindow.webContents.send('update-status', {
                type: 'toast',
                message: `✅ Your app is up to date! (v${localVersion})`
            });
        }
    } catch (err) {
        if (isManual) {
            mainWindow.webContents.send('update-status', {
                type: 'toast',
                message: `⚠️ ${err.message}`
            });
        }
    } finally {
        isCheckingUpdate = false;
    }
}

async function performLiveOtaUpdate() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const filesToSync = ['package.json', 'main.js', 'preload.js', 'renderer.js', 'index.html'];
    const downloadedFiles = {};

    try {
        const { owner, repo } = extractOwnerRepo();
        const liveSha = await getLatestCommitSha(owner, repo);

        for (let i = 0; i < filesToSync.length; i++) {
            const fileName = filesToSync[i];
            const pct = Math.round(((i + 1) / filesToSync.length) * 100);
            mainWindow.webContents.send('update-status', {
                type: 'progress',
                message: `📥 Syncing ${fileName} (${pct}%)...`
            });

            const content = await fetchFileFromGitHub(fileName, liveSha);
            if (!content || content.trim().length < 20) {
                throw new Error(`Invalid content received for ${fileName}`);
            }
            if (fileName === 'package.json') {
                const parsedPkg = JSON.parse(content);
                parsedPkg.updateRepoUrl = DEFAULT_UPDATE_REPO_URL;
                downloadedFiles[fileName] = JSON.stringify(parsedPkg, null, 2);
            } else {
                downloadedFiles[fileName] = content;
            }
        }

        for (const fileName of filesToSync) {
            const targetPath = path.join(__dirname, fileName);
            fs.writeFileSync(targetPath, downloadedFiles[fileName], 'utf8');
        }

        mainWindow.webContents.send('update-status', {
            type: 'progress',
            message: '✅ Update complete! Restarting app now...'
        });

        if (autoUpdateTimer) {
            clearInterval(autoUpdateTimer);
            autoUpdateTimer = null;
        }
        detachDebuggerSafely();
        if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
            powerSaveBlocker.stop(powerBlockerId);
        }

        await wait(800);
        app.relaunch();
        app.exit(0);
    } catch (err) {
        mainWindow.webContents.send('update-status', {
            type: 'error',
            message: `❌ Update failed: ${err.message}`
        });
    }
}

// ==========================================================
// 🔐 CLEAN MAIN-VIEW PRELOAD (STRICTLY SKIPS ALL GOOGLE HOSTS!)
// ==========================================================
const STEALTH_PRELOAD_PATH = path.join(WORK_TEMP_DIR, 'pixelcut_stealth_preload.js');

const STEALTH_MAIN_WORLD_SCRIPT = `
(function() {
    // 🛡️ NEVER touch Google/Firebase auth pages — zero tampering means Google trusts the browser!
    const host = (window.location && window.location.hostname) ? window.location.hostname.toLowerCase() : '';
    if (!host || host.includes('google.') || host.includes('gstatic.') || host.includes('googleapis.') || host.includes('firebaseapp.') || host.includes('youtube.')) {
        return;
    }
    if (window.__pixelcutCleanEnvApplied) return;
    window.__pixelcutCleanEnvApplied = true;

    try {
        const NavProto = window.Navigator && window.Navigator.prototype;
        if (NavProto && window.navigator.webdriver !== false) {
            Object.defineProperty(NavProto, 'webdriver', {
                get: () => false,
                enumerable: true,
                configurable: true
            });
        }
    } catch (e) {}
})();
`;

const FIREFOX_AUTH_SHIM_SCRIPT = `
(function() {
    try {
        if (window.chrome) {
            try { delete window.chrome; } catch (e) {}
            try {
                Object.defineProperty(window, 'chrome', { get: () => undefined, configurable: true });
            } catch (e) {}
        }
        const NavProto = window.Navigator && window.Navigator.prototype;
        if (NavProto) {
            Object.defineProperty(NavProto, 'vendor', { get: () => '', configurable: true });
            Object.defineProperty(NavProto, 'userAgentData', { get: () => undefined, configurable: true });
            Object.defineProperty(NavProto, 'webdriver', { get: () => false, configurable: true });
        }
    } catch (e) {}
})();
`;

function ensureStealthPreloadFile() {
    const preloadContent = `
const { webFrame } = require('electron');
try {
    webFrame.executeJavaScript(${JSON.stringify(STEALTH_MAIN_WORLD_SCRIPT)});
} catch (e) {}
`;
    try {
        fs.writeFileSync(STEALTH_PRELOAD_PATH, preloadContent, 'utf8');
    } catch (e) {
        console.error("Failed to write preload:", e);
    }
}

ensureStealthPreloadFile();

// ==========================================================
// 🎯 300 PPI (PIXELS/INCH) + 8-BIT sRGB PNG METADATA INJECTOR
// ==========================================================
function setPng300PPI(pngBuffer, ppi = 300) {
    try {
        const ppm = Math.round(ppi * 39.37007874);
        const crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            crcTable[n] = c >>> 0;
        }
        function calcCrc(buf) {
            let c = 0xffffffff;
            for (let i = 0; i < buf.length; i++) {
                c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
            }
            return (c ^ 0xffffffff) >>> 0;
        }

        const physChunk = Buffer.alloc(21);
        physChunk.writeUInt32BE(9, 0);
        physChunk.write('pHYs', 4, 4, 'ascii');
        physChunk.writeUInt32BE(ppm, 8);
        physChunk.writeUInt32BE(ppm, 12);
        physChunk.writeUInt8(1, 16);
        const crc = calcCrc(physChunk.subarray(4, 17));
        physChunk.writeUInt32BE(crc, 17);

        const signature = pngBuffer.subarray(0, 8);
        const chunks = [signature];
        let offset = 8;

        while (offset < pngBuffer.length) {
            const length = pngBuffer.readUInt32BE(offset);
            const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
            const totalChunkLen = 12 + length;
            const currentChunk = pngBuffer.subarray(offset, offset + totalChunkLen);

            if (type === 'IHDR') {
                chunks.push(currentChunk);
                chunks.push(physChunk);
            } else if (type !== 'pHYs') {
                chunks.push(currentChunk);
            }

            offset += totalChunkLen;
            if (type === 'IEND') break;
        }
        return Buffer.concat(chunks);
    } catch (e) {
        return pngBuffer;
    }
}

// ==========================================================
// 🧠 100% FREE UNLIMITED DUAL-CONTRAST VISION TITLE ENGINE
// ==========================================================
const FREE_OCR_KEYS = [
    'helloworld',
    'K81899588988957',
    'K89565132488957',
    'K82798126788957',
    'K85951423188957'
];
let ocrKeyIndex = 0;

function httpsPostRequest(urlStr, headers, bodyStr, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const opts = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'User-Agent': CLEAN_CHROMIUM_UA,
                'Accept': 'application/json, text/plain, */*',
                ...headers,
                'Content-Length': Buffer.byteLength(bodyStr)
            },
            timeout: timeoutMs
        };
        const req = https.request(opts, (res) => {
            let chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
                const txt = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(txt);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(bodyStr);
        req.end();
    });
}

async function prepareDualContrastImages(rawBase64DataUrl) {
    try {
        return await mainWindow.webContents.executeJavaScript(`
            (async () => {
                const img = new Image();
                await new Promise((res, rej) => {
                    img.onload = res;
                    img.onerror = rej;
                    img.src = ${JSON.stringify(rawBase64DataUrl)};
                });

                const box = 620;
                const scale = Math.min((box - 36) / (img.width || box), (box - 36) / (img.height || box));
                const w = Math.max(1, Math.round((img.width || box) * scale));
                const h = Math.max(1, Math.round((img.height || box) * scale));
                const ox = Math.round((box - w) / 2);
                const oy = Math.round((box - h) / 2);

                const cWhite = document.createElement('canvas');
                cWhite.width = box;
                cWhite.height = box;
                const ctxW = cWhite.getContext('2d');
                ctxW.fillStyle = '#FFFFFF';
                ctxW.fillRect(0, 0, box, box);
                ctxW.drawImage(img, ox, oy, w, h);

                const cBlack = document.createElement('canvas');
                cBlack.width = box;
                cBlack.height = box;
                const ctxB = cBlack.getContext('2d');
                ctxB.fillStyle = '#111111';
                ctxB.fillRect(0, 0, box, box);
                ctxB.drawImage(img, ox, oy, w, h);

                const cStacked = document.createElement('canvas');
                cStacked.width = box;
                cStacked.height = box * 2;
                const ctxS = cStacked.getContext('2d');
                ctxS.drawImage(cWhite, 0, 0);
                ctxS.drawImage(cBlack, 0, box);

                return {
                    whiteDataUrl: cWhite.toDataURL('image/jpeg', 0.85),
                    blackDataUrl: cBlack.toDataURL('image/jpeg', 0.85),
                    stackedDataUrl: cStacked.toDataURL('image/jpeg', 0.82),
                    boxSize: box
                };
            })();
        `);
    } catch (e) {
        let fallbackB64 = rawBase64DataUrl;
        try {
            const clean = rawBase64DataUrl.replace(/^data:[^;]+;base64,/, '');
            const nImg = nativeImage.createFromBuffer(Buffer.from(clean, 'base64'));
            if (!nImg.isEmpty()) {
                fallbackB64 = `data:image/jpeg;base64,${nImg.resize({ width: 620 }).toJPEG(85).toString('base64')}`;
            }
        } catch (err) {}
        return { whiteDataUrl: fallbackB64, blackDataUrl: fallbackB64, stackedDataUrl: fallbackB64, boxSize: 620 };
    }
}

function toStoreTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

function formatStoreReadyTitleFromText(rawText) {
    if (!rawText) return "";

    let text = rawText
        .replace(/\r?\n/g, ' ')
        .replace(/\bWR\s*[0O]?\s*NG\b/gi, 'Wrong')
        .replace(/\bL\s*[0O]?\s*VE\b/gi, 'Love')
        .replace(/\bH\s*[0O]?\s*PE\b/gi, 'Hope')
        .replace(/\bFA\s*[I1L]?\s*TH\b/gi, 'Faith')
        .replace(/\bSTR\s*[0O]?\s*NG\b/gi, 'Strong')
        .replace(/\bI\s*['’`]\s*m\b/gi, 'I Am')
        .replace(/\bI\s+m\b/gi, 'I Am')
        .replace(/\bI\s*['’`]\s*d\b/gi, 'I Would')
        .replace(/\bdon\s*['’`]\s*t\b/gi, 'Do Not')
        .replace(/\bcan\s*['’`]\s*t\b/gi, 'Can Not')
        .replace(/\bwon\s*['’`]\s*t\b/gi, 'Will Not')
        .replace(/\bit\s*['’`]\s*s\b/gi, 'It Is')
        .replace(/\bthat\s*['’`]\s*s\b/gi, 'That Is')
        .replace(/\bwhat\s*['’`]\s*s\b/gi, 'What Is')
        .replace(/\bshe\s*['’`]\s*s\b/gi, 'She Is')
        .replace(/\bhe\s*['’`]\s*s\b/gi, 'He Is')
        .replace(/\byou\s*['’`]\s*re\b/gi, 'You Are')
        .replace(/\bwe\s*['’`]\s*re\b/gi, 'We Are')
        .replace(/\bthey\s*['’`]\s*re\b/gi, 'They Are')
        .replace(/\bisn\s*['’`]\s*t\b/gi, 'Is Not')
        .replace(/\baren\s*['’`]\s*t\b/gi, 'Are Not')
        .replace(/\bdidn\s*['’`]\s*t\b/gi, 'Did Not')
        .replace(/\bdoesn\s*['’`]\s*t\b/gi, 'Does Not')
        .replace(/\blet\s*['’`]\s*s\b/gi, 'Let Us');

    const clauseParts = text.split(/\.\.\.|\bAS LONG AS\b|\bBECAUSE\b|\bTHEN ALWAYS\b|[?!;]/i);
    if (clauseParts.length > 1 && clauseParts[0].trim()) {
        const firstClauseWords = clauseParts[0].replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
        if (firstClauseWords.length >= 4) {
            text = clauseParts[0];
        }
    }

    const mainWordsCheck = text.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (mainWordsCheck.length >= 6) {
        text = text.replace(/\b(T1D|TYPE\s*1|TYPE\s*2)?\s*AWARENESS\s*$/i, '').trim();
    }

    text = text.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    let words = text.split(' ').filter(w => w.length > 1 || /^[ia]$/i.test(w));
    if (words.length === 0) return "";

    if (words.length >= 8 && /^anymore$/i.test(words[words.length - 1])) {
        words.pop();
    }

    if (words.length > 9) {
        words = words.slice(0, 9);
    }

    const danglingEndings = new Set([
        'and', 'or', 'but', 'the', 'a', 'an', 'of', 'to', 'in',
        'on', 'for', 'with', 'by', 'about', 'that', 'because', 'as', 'is', 'are'
    ]);
    while (words.length > 3 && danglingEndings.has(words[words.length - 1].toLowerCase())) {
        words.pop();
    }

    const finalTitle = toStoreTitleCase(words.join(' '));
    return finalTitle.length >= 2 ? finalTitle : "";
}

async function scanWithFreeNeuralOcr(stackedDataUrl, boxSize) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const activeOcrKey = FREE_OCR_KEYS[ocrKeyIndex % FREE_OCR_KEYS.length];
        ocrKeyIndex++;

        try {
            const postBody = new URLSearchParams({
                apikey: activeOcrKey,
                base64Image: stackedDataUrl,
                language: 'eng',
                OCREngine: '2',
                isOverlayRequired: 'true',
                scale: 'true'
            }).toString();

            const ocrTxt = await httpsPostRequest(
                'https://api.ocr.space/parse/image',
                { 'Content-Type': 'application/x-www-form-urlencoded' },
                postBody,
                9500
            );

            const ocrJson = JSON.parse(ocrTxt);
            const parsedRes = ocrJson?.ParsedResults?.[0];
            if (!parsedRes) continue;

            const lines = parsedRes?.TextOverlay?.Lines || [];
            if (lines.length > 0) {
                const topHalfLines = [];
                const bottomHalfLines = [];

                for (const ln of lines) {
                    const lineText = (ln.LineText || '').trim();
                    if (!lineText) continue;
                    const minTop = Number(ln.MinTop) || 0;
                    if (minTop < boxSize - 10) {
                        topHalfLines.push({ y: minTop, text: lineText });
                    } else {
                        bottomHalfLines.push({ y: minTop - boxSize, text: lineText });
                    }
                }

                topHalfLines.sort((a, b) => a.y - b.y);
                bottomHalfLines.sort((a, b) => a.y - b.y);

                const mergedLines = [...topHalfLines];
                for (const bLine of bottomHalfLines) {
                    const existingIdx = mergedLines.findIndex(tLine => Math.abs(tLine.y - bLine.y) < 28);
                    if (existingIdx === -1) {
                        mergedLines.push(bLine);
                    } else {
                        const tClean = mergedLines[existingIdx].text.replace(/[^a-zA-Z0-9]/g, '');
                        const bClean = bLine.text.replace(/[^a-zA-Z0-9]/g, '');
                        if (bClean.length > tClean.length) {
                            mergedLines[existingIdx] = bLine;
                        }
                    }
                }
                mergedLines.sort((a, b) => a.y - b.y);

                const topText = topHalfLines.map(l => l.text).join(' ');
                const bottomText = bottomHalfLines.map(l => l.text).join(' ');
                const mergedText = mergedLines.map(l => l.text).join(' ');

                const candidates = [mergedText, topText, bottomText]
                    .map(t => formatStoreReadyTitleFromText(t))
                    .filter(Boolean);

                if (candidates.length > 0) {
                    return candidates[0];
                }
            }

            const rawParsed = (parsedRes.ParsedText || '').trim();
            if (rawParsed) {
                const title = formatStoreReadyTitleFromText(rawParsed);
                if (title) return title;
            }
        } catch (e) {}
    }
    return "";
}

async function scanWithLocalTesseractInWindow(whiteDataUrl, blackDataUrl) {
    try {
        const rawExtracted = await mainWindow.webContents.executeJavaScript(`
            (async () => {
                if (!window.Tesseract) {
                    await new Promise((res, rej) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
                        s.onload = res;
                        s.onerror = rej;
                        document.head.appendChild(s);
                    });
                }
                if (!window.__ocrWorker) {
                    window.__ocrWorker = await window.Tesseract.createWorker('eng');
                }
                const r1 = await window.__ocrWorker.recognize(${JSON.stringify(whiteDataUrl)});
                const t1 = (r1?.data?.text || '').trim();
                if (t1.replace(/[^a-zA-Z]/g, '').length >= 6) return t1;

                const r2 = await window.__ocrWorker.recognize(${JSON.stringify(blackDataUrl)});
                const t2 = (r2?.data?.text || '').trim();
                return t2.length > t1.length ? t2 : t1;
            })();
        `);
        return formatStoreReadyTitleFromText(rawExtracted);
    } catch (e) {
        return "";
    }
}

async function generateAiTitleNode(rawBase64DataUrl, customApiKey) {
    const { whiteDataUrl, blackDataUrl, stackedDataUrl, boxSize } = await prepareDualContrastImages(rawBase64DataUrl);

    const userKey = (customApiKey || '').trim();
    if (userKey && (userKey.startsWith('sk-') || userKey.startsWith('ghp_') || userKey.startsWith('github_pat_'))) {
        try {
            const endpoint = userKey.startsWith('sk-')
                ? 'https://api.openai.com/v1/chat/completions'
                : 'https://models.inference.ai.azure.com/chat/completions';
            const payload = JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Read this T-shirt design carefully and output ONLY one catchy, store-upload-friendly title (3 to 8 words, Title Case, no quotes or punctuation).' },
                        { type: 'image_url', image_url: { url: stackedDataUrl } }
                    ]
                }],
                temperature: 0.1,
                max_tokens: 40
            });
            const resTxt = await httpsPostRequest(endpoint, { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userKey}` }, payload, 9000);
            const resJson = JSON.parse(resTxt);
            const reply = (resJson?.choices?.[0]?.message?.content || '').trim();
            const clean = formatStoreReadyTitleFromText(reply);
            if (clean) return clean;
        } catch (e) {}
    }

    const neuralTitle = await scanWithFreeNeuralOcr(stackedDataUrl, boxSize);
    if (neuralTitle) {
        console.log(`✅ [Store Title Generated]: ${neuralTitle}`);
        return neuralTitle;
    }

    const localTitle = await scanWithLocalTesseractInWindow(whiteDataUrl, blackDataUrl);
    if (localTitle) {
        console.log(`✅ [Local Engine Store Title]: ${localTitle}`);
        return localTitle;
    }

    return "Vintage Graphic Art Print";
}

// ==========================================================
// ✂️ STEP B: PHOTOSHOP 5000x5000px (300 PPI) + 2x LAYER + TRIM & SAVE
// ==========================================================
async function processTransparentPng5000pxTrimAndSave(rawPngPath, readyTitle) {
    const pngB64 = fs.readFileSync(rawPngPath).toString('base64');
    const dataUrl = `data:image/png;base64,${pngB64}`;

    const trimmedPngDataUrl = await mainWindow.webContents.executeJavaScript(`
        (async () => {
            const img = new Image();
            await new Promise((res, rej) => {
                img.onload = res;
                img.onerror = rej;
                img.src = "${dataUrl}";
            });

            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;

            const c1 = document.createElement("canvas");
            c1.width = w;
            c1.height = h;
            const ctx1 = c1.getContext("2d", { willReadFrequently: true });
            ctx1.imageSmoothingEnabled = true;
            ctx1.imageSmoothingQuality = "high";

            ctx1.drawImage(img, 0, 0, w, h);
            ctx1.drawImage(img, 0, 0, w, h);

            const imgDataObj = ctx1.getImageData(0, 0, w, h);
            const data = imgDataObj.data;

            let minX = w, minY = h, maxX = -1, maxY = -1;
            for (let y = 0; y < h; y++) {
                const rowOffset = y * w * 4;
                for (let x = 0; x < w; x++) {
                    if (data[rowOffset + x * 4 + 3] > 15) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (maxX < minX || maxY < minY) {
                minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
            }

            const trimW = (maxX - minX) + 1;
            const trimH = (maxY - minY) + 1;

            const maxTarget = 5000;
            const scale = maxTarget / Math.max(trimW, trimH);
            const finalW = Math.max(1, Math.round(trimW * scale));
            const finalH = Math.max(1, Math.round(trimW === trimH ? finalW : trimH * scale));

            const c2 = document.createElement("canvas");
            c2.width = finalW;
            c2.height = finalH;
            const ctx2 = c2.getContext("2d");
            ctx2.imageSmoothingEnabled = true;
            ctx2.imageSmoothingQuality = "high";

            ctx2.drawImage(c1, minX, minY, trimW, trimH, 0, 0, finalW, finalH);
            ctx2.drawImage(c1, minX, minY, trimW, trimH, 0, 0, finalW, finalH);

            return c2.toDataURL("image/png");
        })();
    `);

    const outDir = getOutputFolder();
    const safeTitle = (readyTitle || 'Vintage Graphic Art').replace(/[\\/*?:"<>|]/g, '').trim() || 'Vintage Graphic Art';
    let finalSavePath = path.join(outDir, `${safeTitle}.png`);
    let counter = 1;
    while (fs.existsSync(finalSavePath)) {
        finalSavePath = path.join(outDir, `${safeTitle} ${counter}.png`);
        counter++;
    }

    const outB64 = trimmedPngDataUrl.replace(/^data:image\/png;base64,/, '');
    const png300PpiBuffer = setPng300PPI(Buffer.from(outB64, 'base64'), 300);
    fs.writeFileSync(finalSavePath, png300PpiBuffer);

    try {
        if (fs.existsSync(rawPngPath) && rawPngPath !== finalSavePath) {
            fs.unlinkSync(rawPngPath);
        }
    } catch (e) {}

    return path.basename(finalSavePath);
}

// ==========================================================
// 🛠️ CHROME DEVTOOLS PROTOCOL (CDP) CLICK & ANTI-MINIMIZE ENGINE
// ==========================================================
async function ensureDebugger() {
    if (!view || !view.webContents) return null;
    const dbg = view.webContents.debugger;
    if (!dbg.isAttached()) {
        try {
            dbg.attach('1.3');
        } catch (err) {}
    }
    try {
        await dbg.sendCommand('Page.enable');
        await dbg.sendCommand('DOM.enable');
        await dbg.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
        await dbg.sendCommand('Page.setWebLifecycleState', { state: 'active' });
    } catch (e) {}
    return dbg;
}

function detachDebuggerSafely() {
    try {
        if (view && view.webContents && view.webContents.debugger.isAttached()) {
            view.webContents.debugger.detach();
        }
    } catch (e) {}
}

async function cdpClick(x, y) {
    const dbg = await ensureDebugger();
    const rx = Math.round(x);
    const ry = Math.round(y);
    await dbg.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: rx,
        y: ry,
        button: 'none'
    });
    await wait(50);
    await dbg.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: rx,
        y: ry,
        button: 'left',
        buttons: 1,
        clickCount: 1
    });
    await wait(60);
    await dbg.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: rx,
        y: ry,
        button: 'left',
        buttons: 1,
        clickCount: 1
    });
    await wait(80);
}

const FILE_INPUT_HOOK_SCRIPT = `
    (function() {
        const host = (window.location && window.location.hostname) ? window.location.hostname.toLowerCase() : '';
        if (!host || host.includes('google.') || host.includes('firebaseapp.') || host.includes('gstatic.') || host.includes('youtube.')) {
            return;
        }

        function maskAsNative(fn, name) {
            try {
                Object.defineProperty(fn, 'toString', {
                    value: function() { return 'function ' + name + '() { [native code] }'; },
                    configurable: true
                });
            } catch (e) {}
            return fn;
        }

        try {
            Object.defineProperty(document, 'hidden', { get: maskAsNative(() => false, 'get hidden'), configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: maskAsNative(() => 'visible', 'get visibilityState'), configurable: true });
            Object.defineProperty(document, 'webkitHidden', { get: maskAsNative(() => false, 'get webkitHidden'), configurable: true });
            document.hasFocus = maskAsNative(() => true, 'hasFocus');
            window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
        } catch (e) {}

        if (!window.__rafKeepAliveInstalled) {
            window.__rafKeepAliveInstalled = true;
            const origRAF = window.requestAnimationFrame;
            window.requestAnimationFrame = maskAsNative(function requestAnimationFrame(cb) {
                let called = false;
                const timerId = setTimeout(() => {
                    if (!called) {
                        called = true;
                        cb(performance.now());
                    }
                }, 16);
                origRAF.call(window, (ts) => {
                    if (!called) {
                        called = true;
                        clearTimeout(timerId);
                        cb(ts);
                    }
                });
                return timerId;
            }, 'requestAnimationFrame');
        }

        if (window.__pixelcutHookInstalled) return;
        window.__pixelcutHookInstalled = true;
        window.__lastClickedFileInput = null;
        window.__createdFileInputs = [];

        try {
            delete window.showOpenFilePicker;
            delete Window.prototype.showOpenFilePicker;
        } catch (e) {
            window.showOpenFilePicker = undefined;
        }

        const origCreateElement = document.createElement;
        document.createElement = maskAsNative(function createElement(tagName, options) {
            const el = origCreateElement.call(this, tagName, options);
            if (String(tagName).toLowerCase() === 'input') {
                window.__createdFileInputs.push(el);
            }
            return el;
        }, 'createElement');

        const origHtmlClick = HTMLElement.prototype.click;
        HTMLElement.prototype.click = maskAsNative(function click() {
            if (this && (this.tagName === 'INPUT' && this.type === 'file')) {
                window.__lastClickedFileInput = this;
                if (!window.__createdFileInputs.includes(this)) {
                    window.__createdFileInputs.push(this);
                }
                return;
            }
            return origHtmlClick.apply(this, arguments);
        }, 'click');

        HTMLInputElement.prototype.click = maskAsNative(function click() {
            if (this.type === 'file') {
                window.__lastClickedFileInput = this;
                if (!window.__createdFileInputs.includes(this)) {
                    window.__createdFileInputs.push(this);
                }
                return;
            }
            return origHtmlClick.apply(this, arguments);
        }, 'click');
    })();
`;

function updateViewBounds() {
    if (!mainWindow || !view || mainWindow.isDestroyed()) return;

    if (!mainWindow.isMinimized()) {
        const [w, h] = mainWindow.getContentSize();
        if (w > 200 && h > 200) {
            lastValidWindowSize = [w, h];
        }
    }

    const [winWidth, winHeight] = lastValidWindowSize;
    if (isViewVisible) {
        view.setBounds({ x: 0, y: 210, width: winWidth, height: Math.max(300, winHeight - 210) });
    } else {
        view.setBounds({ x: Math.max(0, winWidth - 2), y: Math.max(0, winHeight - 2), width: 1365, height: 911 });
    }
}

// ==========================================================
// 🔐 UNIVERSAL GOOGLE LOGIN SHIELD (WORKS ON EVERY PC!)
// ==========================================================
async function clearGoogleRejectionCookies(ses) {
    try {
        const domains = ['google.com', 'accounts.google.com', 'youtube.com'];
        for (const dom of domains) {
            const cookies = await ses.cookies.get({ domain: dom });
            for (const c of cookies) {
                const cookieUrl = `https://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path || '/'}`;
                await ses.cookies.remove(cookieUrl, c.name).catch(() => {});
            }
        }
    } catch (e) {}
}

function configurePersistSessionHeaders() {
    ensureStealthPreloadFile();
    const ses = session.fromPartition('persist:pixelcut_pro');

    // 🔥 DO NOT call ses.setUserAgent() or ses.registerPreloadScript() globally!
    // Keeping session default clean ensures Google OAuth popups run with 100% genuine Electron identity.
    const CH_UA_CHROMIUM = `"Not-A.Brand";v="99", "Chromium";v="${CHROME_MAJOR}"`;
    const CH_UA_FULL_CHROMIUM = `"Not-A.Brand";v="99.0.0.0", "Chromium";v="${CHROME_FULL_VERSION}"`;

    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = details.requestHeaders || {};
        const wcId = details.webContentsId;

        // 1. Auto-Fallback Firefox Mode (if an account/PC ever rejected native Electron)
        if (wcId && firefoxFallbackPopupIds.has(wcId)) {
            for (const k of Object.keys(headers)) {
                const lk = k.toLowerCase();
                if (lk === 'user-agent' || lk.startsWith('sec-ch-ua')) {
                    delete headers[k];
                }
            }
            headers['User-Agent'] = FIREFOX_UA;
            return callback({ cancel: false, requestHeaders: headers });
        }

        // 2. Clean OAuth Popups OR Main View while inside Google Login -> 100% UNTOUCHED headers!
        if ((wcId && oauthPopupIds.has(wcId)) || (view && !view.isDestroyed() && wcId === view.webContents.id && isViewInGoogleLoginMode)) {
            return callback({ cancel: false, requestHeaders: headers });
        }

        // 3. Normal Pixelcut / Web App View -> Clean Chromium UA (keeps Cloudflare working smoothly)
        if (view && !view.isDestroyed() && wcId === view.webContents.id) {
            for (const k of Object.keys(headers)) {
                const lk = k.toLowerCase();
                if (
                    lk === 'user-agent' ||
                    lk === 'sec-ch-ua' ||
                    lk === 'sec-ch-ua-full-version-list' ||
                    lk === 'sec-ch-ua-full-version' ||
                    lk === 'sec-ch-ua-platform' ||
                    lk === 'sec-ch-ua-mobile'
                ) {
                    delete headers[k];
                }
            }
            headers['User-Agent'] = CLEAN_CHROMIUM_UA;
            headers['sec-ch-ua'] = CH_UA_CHROMIUM;
            headers['sec-ch-ua-mobile'] = '?0';
            headers['sec-ch-ua-platform'] = '"Windows"';
            headers['sec-ch-ua-full-version'] = `"${CHROME_FULL_VERSION}"`;
            headers['sec-ch-ua-full-version-list'] = CH_UA_FULL_CHROMIUM;
        }

        callback({ cancel: false, requestHeaders: headers });
    });
}

function getCleanOAuthPopupOptions() {
    return {
        width: 540,
        height: 700,
        center: true,
        autoHideMenuBar: true,
        title: "Google Sign-In",
        webPreferences: {
            partition: 'persist:pixelcut_pro',
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            nativeWindowOpen: true
            // 🔥 ZERO preload script attached — pure genuine browser environment!
        }
    };
}

function attachGoogleLoginShieldToPopup(childWin) {
    if (!childWin || childWin.isDestroyed()) return;

    const wcId = childWin.webContents.id;
    oauthPopupIds.add(wcId);

    // Ensure genuine untouched Electron UA from frame 0
    childWin.webContents.setUserAgent(NATIVE_ELECTRON_UA);

    let lastGoogleAuthUrl = '';
    let fallbackStage = 0; // 0 = Native Electron, 1 = Firefox Fallback

    childWin.on('closed', () => {
        oauthPopupIds.delete(wcId);
        firefoxFallbackPopupIds.delete(wcId);
    });

    childWin.webContents.setWindowOpenHandler(() => {
        if (!isAutomationRunning) {
            detachDebuggerSafely();
        }
        return {
            action: 'allow',
            overrideBrowserWindowOptions: getCleanOAuthPopupOptions()
        };
    });

    childWin.webContents.on('did-create-window', (nestedWin) => {
        attachGoogleLoginShieldToPopup(nestedWin);
    });

    childWin.webContents.on('dom-ready', () => {
        if (!childWin.isDestroyed() && firefoxFallbackPopupIds.has(wcId)) {
            childWin.webContents.executeJavaScript(FIREFOX_AUTH_SHIM_SCRIPT).catch(() => {});
        }
    });

    childWin.webContents.on('did-navigate', async (_event, navUrl) => {
        if (!navUrl || childWin.isDestroyed()) return;

        // Save valid Google Sign-In URL before any possible rejection redirect
        if (isGoogleAuthHost(navUrl) && !navUrl.includes('/signin/rejected') && !navUrl.includes('/CookieMismatch')) {
            lastGoogleAuthUrl = navUrl;
        }

        // 🔥 Auto-Recovery Layer: if Google rejects even native Electron on a strict PC/account, switch cleanly to Firefox Mode!
        if ((navUrl.includes('/signin/rejected') || navUrl.includes('/v3/signin/rejected')) && fallbackStage === 0) {
            fallbackStage = 1;
            const ses = session.fromPartition('persist:pixelcut_pro');
            await clearGoogleRejectionCookies(ses);

            if (!childWin.isDestroyed()) {
                firefoxFallbackPopupIds.add(wcId);
                childWin.webContents.setUserAgent(FIREFOX_UA);
                if (lastGoogleAuthUrl) {
                    childWin.loadURL(lastGoogleAuthUrl);
                } else if (childWin.webContents.navigationHistory?.canGoBack()) {
                    childWin.webContents.navigationHistory.goBack();
                } else {
                    childWin.webContents.goBack();
                }
            }
        }
    });
}

function createWindow() {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    configurePersistSessionHeaders();

    mainWindow = new BrowserWindow({
        width: 1050,
        height: 780,
        title: "Pixelcut Pro Tool",
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
            paintWhenInitiallyHidden: true
        },
        autoHideMenuBar: true
    });

    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        const localPkg = getLocalPackageJson();
        mainWindow.webContents.send('app-version', localPkg.version || '1.0.0');

        setTimeout(() => {
            checkOnlineUpdate(false);
        }, 1500);

        if (autoUpdateTimer) clearInterval(autoUpdateTimer);
        autoUpdateTimer = setInterval(() => {
            checkOnlineUpdate(false);
        }, 10000);
    });

    mainWindow.on('closed', () => {
        if (autoUpdateTimer) {
            clearInterval(autoUpdateTimer);
            autoUpdateTimer = null;
        }
    });

    view = new BrowserView({
        webPreferences: {
            preload: STEALTH_PRELOAD_PATH,
            backgroundThrottling: false,
            paintWhenInitiallyHidden: true,
            partition: 'persist:pixelcut_pro',
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            nativeWindowOpen: true
        }
    });

    view.webContents.setUserAgent(CLEAN_CHROMIUM_UA);

    // Track redirect-based Google Sign-In in main view (also prepares for Image Vectorizer & similar sites!)
    let viewLastGoogleAuthUrl = '';
    let viewFallbackStage = 0;

    view.webContents.on('will-navigate', (event, navUrl) => {
        if (!isAutomationRunning && isGoogleAuthHost(navUrl) && !isViewInGoogleLoginMode) {
            event.preventDefault();
            isViewInGoogleLoginMode = true;
            viewFallbackStage = 0;
            viewLastGoogleAuthUrl = navUrl;
            detachDebuggerSafely();
            view.webContents.setUserAgent(NATIVE_ELECTRON_UA);
            view.webContents.loadURL(navUrl);
        }
    });

    view.webContents.on('did-navigate', async (_event, navUrl) => {
        if (!navUrl) return;

        if (isGoogleAuthHost(navUrl) && !navUrl.includes('/signin/rejected')) {
            viewLastGoogleAuthUrl = navUrl;
        }

        if ((navUrl.includes('/signin/rejected') || navUrl.includes('/v3/signin/rejected')) && viewFallbackStage === 0) {
            viewFallbackStage = 1;
            isViewInGoogleLoginMode = true;
            const ses = session.fromPartition('persist:pixelcut_pro');
            await clearGoogleRejectionCookies(ses);
            firefoxFallbackPopupIds.add(view.webContents.id);
            view.webContents.setUserAgent(FIREFOX_UA);
            if (viewLastGoogleAuthUrl) {
                view.webContents.loadURL(viewLastGoogleAuthUrl);
            }
            return;
        }

        // Returned back from Google Sign-In to main site
        if (!isGoogleDomainHost(navUrl) && isViewInGoogleLoginMode) {
            isViewInGoogleLoginMode = false;
            viewFallbackStage = 0;
            firefoxFallbackPopupIds.delete(view.webContents.id);
            view.webContents.setUserAgent(CLEAN_CHROMIUM_UA);
        }
    });

    view.webContents.setWindowOpenHandler(() => {
        if (!isAutomationRunning) {
            detachDebuggerSafely();
        }
        return {
            action: 'allow',
            overrideBrowserWindowOptions: getCleanOAuthPopupOptions()
        };
    });

    view.webContents.on('did-create-window', (childWin) => {
        attachGoogleLoginShieldToPopup(childWin);
    });

    mainWindow.setBrowserView(view);
    updateViewBounds();

    mainWindow.on('resize', () => {
        if (!mainWindow.isMinimized()) {
            updateViewBounds();
        }
    });

    mainWindow.on('minimize', () => {
        if (isAutomationRunning) {
            ensureDebugger().catch(() => {});
            view.webContents.executeJavaScript(FILE_INPUT_HOOK_SCRIPT).catch(() => {});
        }
    });

    mainWindow.on('restore', () => {
        updateViewBounds();
    });

    view.webContents.loadURL('https://www.pixelcut.ai/create');

    view.webContents.on('dom-ready', () => {
        if (isAutomationRunning) {
            ensureDebugger().catch(() => {});
            view.webContents.executeJavaScript(FILE_INPUT_HOOK_SCRIPT).catch(() => {});
        } else {
            detachDebuggerSafely();
            if (firefoxFallbackPopupIds.has(view.webContents.id)) {
                view.webContents.executeJavaScript(FIREFOX_AUTH_SHIM_SCRIPT).catch(() => {});
            } else if (!isViewInGoogleLoginMode) {
                view.webContents.executeJavaScript(FILE_INPUT_HOOK_SCRIPT).catch(() => {});
            }
        }
    });

    view.webContents.on('did-finish-load', () => {
        if (isAutomationRunning) {
            ensureDebugger().catch(() => {});
            view.webContents.executeJavaScript(FILE_INPUT_HOOK_SCRIPT).catch(() => {});
        } else {
            detachDebuggerSafely();
            if (!isViewInGoogleLoginMode) {
                view.webContents.executeJavaScript(FILE_INPUT_HOOK_SCRIPT).catch(() => {});
            }
        }
    });

    view.webContents.on('console-message', (event, level, message) => {
        if (message.startsWith('APP_STATUS:|')) {
            const parts = message.split('|');
            if (parts.length >= 3 && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('progress-update', {
                    percent: parseInt(parts[1], 10),
                    text: parts[2],
                    activeIndex: currentActiveIndex,
                    isCompleted: false
                });
            }
        }
    });

    view.webContents.session.on('will-download', (event, item) => {
        const tempFileName = `raw_pixelcut_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`;
        const tempSavePath = path.join(WORK_TEMP_DIR, tempFileName);
        item.setSavePath(tempSavePath);

        item.once('done', (e, state) => {
            if (downloadDoneResolver) {
                downloadDoneResolver({ state, filePath: tempSavePath });
                downloadDoneResolver = null;
            }
        });
    });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (autoUpdateTimer) {
        clearInterval(autoUpdateTimer);
        autoUpdateTimer = null;
    }
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
        powerSaveBlocker.stop(powerBlockerId);
    }
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('check-for-update', (_event, isManual) => {
    checkOnlineUpdate(Boolean(isManual));
});

ipcMain.on('start-live-update', () => {
    performLiveOtaUpdate();
});

ipcMain.on('toggle-view', (event, show) => {
    isViewVisible = Boolean(show);
    if (!isAutomationRunning) {
        detachDebuggerSafely();
    }
    updateViewBounds();
});

ipcMain.on('start-reset', async () => {
    if (view && view.webContents) {
        await view.webContents.loadURL('https://www.pixelcut.ai/create');
    }
});

ipcMain.on('open-file-location', (event, fileUrlOrPath) => {
    try {
        const cleanPath = fileUrlOrPath.startsWith('file:///')
            ? decodeURIComponent(fileUrlOrPath.replace('file:///', ''))
            : fileUrlOrPath;
        shell.showItemInFolder(path.normalize(cleanPath));
    } catch (err) {
        console.error("Failed to open file location:", err);
    }
});

function sendGalleryFiles() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
        const outDir = getOutputFolder();
        const files = fs.readdirSync(outDir)
            .filter(name => name.toLowerCase().endsWith('.png'))
            .map(name => {
                const fullPath = path.join(outDir, name);
                const stat = fs.statSync(fullPath);
                return {
                    url: `file:///${fullPath.replace(/\\/g, '/')}`,
                    time: stat.mtimeMs
                };
            })
            .sort((a, b) => b.time - a.time)
            .slice(0, 24)
            .map(item => item.url);

        mainWindow.webContents.send('gallery-data', files);
    } catch (err) {
        mainWindow.webContents.send('gallery-data', []);
    }
}

ipcMain.on('refresh-gallery', () => {
    sendGalleryFiles();
});

// ==========================================================
// 🔍 DOM COORDS HELPER FOR PIXELCUT DOWNLOAD WORKFLOW
// ==========================================================
async function getPixelcutElement(type) {
    return await view.webContents.executeJavaScript(`
        (() => {
            function rectOf(el) {
                if (!el) return null;
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return null;
                return {
                    x: r.left + r.width / 2,
                    y: r.top + r.height / 2,
                    width: r.width,
                    height: r.height
                };
            }

            if ("${type}" === "homeRemoveBgBtn") {
                const rmImg = document.querySelector('img[alt="Remove BG"], img[alt*="Remove BG" i], img[src*="ai-tools-remove-bg"]');
                if (rmImg) {
                    const cardDiv = rmImg.closest('div.cursor-pointer, button, [role="button"]') || rmImg.parentElement || rmImg;
                    if (cardDiv && cardDiv.offsetWidth > 0 && cardDiv.offsetHeight > 0) {
                        return rectOf(cardDiv);
                    }
                }

                const btn = Array.from(document.querySelectorAll('div.cursor-pointer, button, [role="button"]')).find(b => {
                    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                    return (txt === 'remove bg' || txt.includes('remove background') || txt.includes('remove bg')) && b.offsetWidth > 0 && b.offsetHeight > 0;
                });
                return rectOf(btn);
            }

            if ("${type}" === "sidebarRemoveBgBtn") {
                const btn = Array.from(document.querySelectorAll('aside button, button')).find(b => {
                    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                    return txt === 'remove background' && b.offsetWidth > 0 && b.offsetHeight > 0 && !b.disabled;
                });
                return rectOf(btn);
            }

            if ("${type}" === "cutoutReadyStatus") {
                const aside = document.querySelector('aside');
                const asideText = aside ? (aside.innerText || '').toLowerCase() : '';
                const hasBgPanel = asideText.includes('basic colors') || asideText.includes('add shadow');

                const topDlBtn = Array.from(document.querySelectorAll('aside button')).find(b =>
                    (b.innerText || b.textContent || '').trim() === 'Download'
                );
                const hasSpinner = Boolean(
                    document.querySelector('aside svg.animate-spin, main svg.animate-spin, [role="progressbar"], #pixelcut-spinner')
                );
                const isTopBtnReady = Boolean(
                    topDlBtn &&
                    topDlBtn.offsetWidth > 0 &&
                    !topDlBtn.disabled &&
                    !topDlBtn.className.includes('opacity-50') &&
                    !hasSpinner
                );

                return {
                    hasBgPanel,
                    isTopBtnReady,
                    topBtnRect: isTopBtnReady ? rectOf(topDlBtn) : null
                };
            }

            if ("${type}" === "firstDownloadBtn") {
                const topDlBtn = Array.from(document.querySelectorAll('aside button')).find(b =>
                    (b.innerText || b.textContent || '').trim() === 'Download' && b.offsetWidth > 40
                );
                return rectOf(topDlBtn);
            }

            if ("${type}" === "secondPopupDownloadBtn") {
                const allDlBtns = Array.from(document.querySelectorAll('button')).filter(b => {
                    const txt = (b.innerText || b.textContent || '').trim();
                    return txt === 'Download' && b.offsetWidth > 40 && b.offsetHeight > 20 && !b.disabled;
                });

                if (allDlBtns.length >= 2) {
                    const popupBtn = allDlBtns[allDlBtns.length - 1];
                    return rectOf(popupBtn);
                }

                const popper = document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"]');
                if (popper) {
                    const btnInPopper = Array.from(popper.querySelectorAll('button')).find(b =>
                        (b.innerText || b.textContent || '').trim() === 'Download' && b.offsetWidth > 40 && !b.disabled
                    );
                    if (btnInPopper) return rectOf(btnInPopper);
                }

                return null;
            }

            return null;
        })();
    `);
}

// ==========================================================
// 🚀 মূল ব্যাচ অটোমেশন প্রসেস (MINIMIZE-PROOF + AUTO-RETRY PER FILE!)
// ==========================================================
async function runBatchAutomation(event, incomingData) {
    const filesArray = Array.isArray(incomingData) ? incomingData : (incomingData.files || [incomingData]);
    const customApiKey = (!Array.isArray(incomingData) && incomingData.apiKey) ? incomingData.apiKey : '';

    const sendStatus = (msg) => event.sender.send('status-update', msg);
    const sendProgress = (percent, text, activeIndex = currentActiveIndex, isCompleted = false, aiTitle = '') => {
        event.sender.send('progress-update', { percent, text, activeIndex, isCompleted, aiTitle });
    };

    isAutomationRunning = true;
    isViewInGoogleLoginMode = false;
    firefoxFallbackPopupIds.delete(view.webContents.id);
    view.webContents.setUserAgent(CLEAN_CHROMIUM_UA);

    await ensureDebugger();
    updateViewBounds();

    const aiTitlesMap = new Map();
    (async () => {
        for (let idx = 0; idx < filesArray.length; idx++) {
            const fObj = filesArray[idx];
            const t = await generateAiTitleNode(fObj.data, customApiKey);
            aiTitlesMap.set(idx, t);
            await wait(350);
        }
    })();

    try {
        for (let i = 0; i < filesArray.length; i++) {
            currentActiveIndex = i;
            const fileObj = filesArray[i];
            currentOriginalName = fileObj.name || `Image_${i + 1}`;
            const fileLabel = `[${i + 1}/${filesArray.length}]`;

            let fileCompleted = false;
            for (let fileTry = 1; fileTry <= 3 && !fileCompleted; fileTry++) {
                try {
                    await ensureDebugger();
                    updateViewBounds();

                    sendProgress(5, `${fileLabel} Loading Pixelcut Studio${fileTry > 1 ? ` (Retry ${fileTry})` : ''}...`, i, false);
                    await view.webContents.loadURL('https://www.pixelcut.ai/create');
                    await ensureDebugger();
                    await view.webContents.executeJavaScript(FILE_INPUT_HOOK_SCRIPT).catch(() => {});
                    await wait(2800);

                    sendProgress(18, `${fileLabel} Selecting Remove BG tool...`, i, false);
                    await view.webContents.executeJavaScript(`window.__lastClickedFileInput = null;`).catch(() => {});

                    let homeBtnRect = null;
                    for (let a = 0; a < 35; a++) {
                        homeBtnRect = await getPixelcutElement('homeRemoveBgBtn');
                        if (homeBtnRect) break;
                        await wait(300);
                    }
                    if (homeBtnRect) {
                        await cdpClick(homeBtnRect.x, homeBtnRect.y);
                        await wait(450);
                    }

                    await view.webContents.executeJavaScript(`
                        (() => {
                            if (!window.__lastClickedFileInput) {
                                const rmImg = document.querySelector('img[alt="Remove BG"], img[alt*="Remove BG" i], img[src*="ai-tools-remove-bg"]');
                                const cardDiv = rmImg ? (rmImg.closest('div.cursor-pointer, button, [role="button"]') || rmImg.parentElement) : null;
                                if (cardDiv) cardDiv.click();
                            }
                        })();
                    `).catch(() => {});
                    await wait(350);

                    sendProgress(32, `${fileLabel} Uploading image...`, i, false);
                    await view.webContents.executeJavaScript(`
                        (async () => {
                            const fileDataUrl = ${JSON.stringify(fileObj.data)};
                            const fileName = ${JSON.stringify(fileObj.name || 'image.png')};
                            const fileMime = ${JSON.stringify(fileObj.type || 'image/png')};

                            const res = await fetch(fileDataUrl);
                            const blob = await res.blob();
                            const file = new File([blob], fileName, { type: fileMime || blob.type || "image/png" });
                            const dt = new DataTransfer();
                            dt.items.add(file);

                            let input = window.__lastClickedFileInput;
                            if (!input && window.__createdFileInputs && window.__createdFileInputs.length > 0) {
                                const fileInps = window.__createdFileInputs.filter(el => el && el.type === 'file');
                                if (fileInps.length > 0) input = fileInps[fileInps.length - 1];
                            }
                            if (!input) {
                                const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
                                if (allInputs.length > 0) input = allInputs[allInputs.length - 1];
                            }

                            if (input) {
                                if (!input.isConnected) {
                                    input.style.display = 'none';
                                    document.body.appendChild(input);
                                }
                                if (input._valueTracker) {
                                    try { input._valueTracker.setValue(''); } catch (e) {}
                                }
                                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files')?.set;
                                if (setter) setter.call(input, dt.files);
                                else input.files = dt.files;

                                input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                                input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            } else {
                                const dropTarget = document.querySelector('main') || document.body;
                                const dropOpts = { bubbles: true, cancelable: true, dataTransfer: dt };
                                dropTarget.dispatchEvent(new DragEvent('dragenter', dropOpts));
                                dropTarget.dispatchEvent(new DragEvent('dragover', dropOpts));
                                dropTarget.dispatchEvent(new DragEvent('drop', dropOpts));
                            }
                        })();
                    `);

                    sendProgress(50, `${fileLabel} Waiting for Editor & AI Background Removal...`, i, false);
                    let rmClickCount = 0;
                    let lastRmClickStep = -5;
                    let cutoutReady = false;

                    for (let w = 0; w < 65; w++) {
                        await wait(1000);

                        if (rmClickCount < 3 && (w - lastRmClickStep) >= 3) {
                            const sideRmRect = await getPixelcutElement('sidebarRemoveBgBtn');
                            if (sideRmRect) {
                                sendProgress(58, `${fileLabel} Clicking Remove Background...`, i, false);
                                await cdpClick(sideRmRect.x, sideRmRect.y);
                                rmClickCount++;
                                lastRmClickStep = w;
                                await wait(1200);
                                continue;
                            }
                        }

                        const status = await getPixelcutElement('cutoutReadyStatus');
                        if (status && status.hasBgPanel && status.isTopBtnReady && w >= 3) {
                            cutoutReady = true;
                            break;
                        }

                        sendProgress(60 + Math.min(w, 20), `${fileLabel} AI is removing background... (${w + 1}s)`, i, false);
                    }

                    if (!cutoutReady) {
                        const fallbackBtn = await getPixelcutElement('firstDownloadBtn');
                        if (!fallbackBtn) throw new Error("Top Download button not ready");
                    }

                    await wait(600);

                    const downloadPromise = new Promise((resolve) => {
                        downloadDoneResolver = resolve;
                        setTimeout(() => {
                            if (downloadDoneResolver) {
                                downloadDoneResolver({ state: 'timeout', filePath: null });
                                downloadDoneResolver = null;
                            }
                        }, 45000);
                    });

                    sendProgress(85, `${fileLabel} Clicking 1st Download button...`, i, false);
                    let secondDlRect = null;

                    for (let openTry = 1; openTry <= 4; openTry++) {
                        secondDlRect = await getPixelcutElement('secondPopupDownloadBtn');
                        if (secondDlRect) break;

                        const firstDlRect = await getPixelcutElement('firstDownloadBtn');
                        if (!firstDlRect) throw new Error("1st Download button not found");

                        await cdpClick(firstDlRect.x, firstDlRect.y);

                        for (let poll = 0; poll < 26; poll++) {
                            await wait(500);
                            secondDlRect = await getPixelcutElement('secondPopupDownloadBtn');
                            if (secondDlRect) break;
                        }

                        if (secondDlRect) break;
                    }

                    if (!secondDlRect) {
                        throw new Error("2nd Download button inside popup did not appear");
                    }

                    await wait(1000);
                    secondDlRect = (await getPixelcutElement('secondPopupDownloadBtn')) || secondDlRect;

                    sendProgress(93, `${fileLabel} Clicking 2nd Download button...`, i, false);
                    await cdpClick(secondDlRect.x, secondDlRect.y);

                    await wait(1000);
                    const stillOpenRect = await getPixelcutElement('secondPopupDownloadBtn');
                    if (stillOpenRect) {
                        await cdpClick(stillOpenRect.x, stillOpenRect.y);
                    }

                    sendProgress(96, `${fileLabel} 📥 Exporting Transparent PNG...`, i, false);
                    const dlOutcome = await downloadPromise;

                    if (dlOutcome && dlOutcome.state === 'completed' && dlOutcome.filePath && fs.existsSync(dlOutcome.filePath)) {
                        let readyTitle = aiTitlesMap.get(i);

                        if (!readyTitle || readyTitle === "Vintage Graphic Art Print" || readyTitle.endsWith('Art')) {
                            const cutoutB64 = `data:image/png;base64,${fs.readFileSync(dlOutcome.filePath).toString('base64')}`;
                            readyTitle = await generateAiTitleNode(cutoutB64, customApiKey);
                            aiTitlesMap.set(i, readyTitle);
                        }

                        sendProgress(98, `${fileLabel} ✂️ 5000x5000px (300 PPI • 2x Layer) Trim -> "${readyTitle}.png"...`, i, false);
                        const savedFileName = await processTransparentPng5000pxTrimAndSave(dlOutcome.filePath, readyTitle);

                        sendGalleryFiles();
                        sendProgress(100, `${fileLabel} ✅ Saved: ${savedFileName}`, i, true);
                        fileCompleted = true;
                        await wait(3000);
                    } else {
                        throw new Error(`Download ${dlOutcome?.state || 'failed'}`);
                    }

                } catch (err) {
                    console.error(`Attempt ${fileTry} error at ${fileLabel}: ${err.message}`);
                    if (fileTry === 3) {
                        sendProgress(100, `${fileLabel} ❌ ${err.message}`, i, false);
                    }
                    await wait(2000);
                }
            }
        }
    } finally {
        isAutomationRunning = false;
        detachDebuggerSafely();
    }

    sendGalleryFiles();
    sendStatus("✅ All images processed, 5000x5000px (300 PPI • 2x Layer) trimmed & saved with AI Titles!");
}

ipcMain.on('start-automation', (event, data) => runBatchAutomation(event, data));
ipcMain.on('start-batch-automation', (event, data) => runBatchAutomation(event, data));
