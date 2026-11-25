const selectFileBtn = document.getElementById('selectFileBtn');
const fileInput = document.getElementById('fileInput');
const startBtn = document.getElementById('startBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const toggleViewBtn = document.getElementById('toggleViewBtn');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const appVersionBadge = document.getElementById('appVersionBadge');

const controls = document.getElementById('controls');
const hudMainWorkspace = document.getElementById('hudMainWorkspace');
const progressWrapper = document.getElementById('progressWrapper');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const percentText = document.getElementById('percentText');

const refreshGalleryBtn = document.getElementById('refreshGalleryBtn');
const galleryGrid = document.getElementById('galleryGrid');
const galleryContainer = document.getElementById('galleryContainer');

const filePreviewBox = document.getElementById('filePreviewBox');
const processingPreviewContainer = document.getElementById('processingPreviewContainer');
const processingImage = document.getElementById('processingImage');
const scannerLine = document.getElementById('scannerLine');
const glassCard = document.querySelector('.glass-card');

// Batch Checkbox History Elements
const historyBar = document.getElementById('historyBar');
const historyEmptyNote = document.getElementById('historyEmptyNote');
const filterAllBtn = document.getElementById('filterAllBtn');
const filterCompletedBtn = document.getElementById('filterCompletedBtn');
const filterFailedBtn = document.getElementById('filterFailedBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Update Modal Elements
const updateModalOverlay = document.getElementById('updateModalOverlay');
const updateVersionPill = document.getElementById('updateVersionPill');
const updateNotesBox = document.getElementById('updateNotesBox');
const updateStatusText = document.getElementById('updateStatusText');
const confirmUpdateBtn = document.getElementById('confirmUpdateBtn');
const closeUpdateModalBtn = document.getElementById('closeUpdateModalBtn');
const toastBanner = document.getElementById('toastBanner');

const HISTORY_STORAGE_KEY = 'pixelcut_last_batch_history';

let selectedFiles = [];
let lastBatchHistory = [];
let fileIdCounter = 0;
let isViewVisible = false;
let isShowingHistory = false;

// ==========================================================
// 🎨 TELEGRAM-STYLE VECTOR SVG ICONS (NO EMOJIS)
// ==========================================================
const SVG_ICONS = {
    globe: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18"/></svg>`,
    eyeOff: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    close: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    fail: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    bolt: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
    refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`
};

function stripLeadingEmojis(str) {
    return String(str || '').replace(/^[\u{1F300}-\u{1FAFF}\u2600-\u27BF\s]+/u, '').trim();
}

// ==========================================================
// 🌗 WHITE / NIGHT THEME TOGGLE (TELEGRAM STYLE)
// ==========================================================
function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    localStorage.setItem('pixelcut_theme', isDark ? 'dark' : 'light');
}

applyTheme(localStorage.getItem('pixelcut_theme') || 'light');

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const nextTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
        applyTheme(nextTheme);
    });
}

function showToast(msg, duration = 3500) {
    if (!toastBanner) return;
    toastBanner.innerText = stripLeadingEmojis(msg);
    toastBanner.style.display = 'block';
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
        toastBanner.style.display = 'none';
    }, duration);
}

// Cache for 128x128 thumbnails so 5000x5000px PNGs never lag the UI
const galleryThumbCache = new Map();

function getLightweightThumbnail(src) {
    if (galleryThumbCache.has(src)) {
        return Promise.resolve(galleryThumbCache.get(src));
    }
    return new Promise((resolve) => {
        const tempImg = new Image();
        tempImg.decoding = 'async';
        tempImg.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const maxDim = 128;
                const scale = Math.min(maxDim / tempImg.width, maxDim / tempImg.height, 1);
                canvas.width = Math.max(1, Math.round(tempImg.width * scale));
                canvas.height = Math.max(1, Math.round(tempImg.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);
                const thumbDataUrl = canvas.toDataURL('image/webp', 0.85);
                galleryThumbCache.set(src, thumbDataUrl);
                resolve(thumbDataUrl);
            } catch (err) {
                resolve(src);
            }
        };
        tempImg.onerror = () => resolve(src);
        tempImg.src = src;
    });
}

// ==========================================================
// 📋 LAST BATCH CHECKBOX HISTORY + CLEAR HISTORY BUTTON
// ==========================================================
function createCompactHistoryThumb(src) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (val) => {
            if (!settled) {
                settled = true;
                resolve(val);
            }
        };
        setTimeout(() => finish(src), 1500);

        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            try {
                const size = 64;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const scale = Math.min(size / (img.width || size), size / (img.height || size));
                const w = Math.max(1, Math.round((img.width || size) * scale));
                const h = Math.max(1, Math.round((img.height || size) * scale));
                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
                const out = canvas.toDataURL('image/webp', 0.7);
                canvas.width = canvas.height = 0;
                finish(out);
            } catch (e) {
                finish(src);
            }
        };
        img.onerror = () => finish(src);
        img.src = src;
    });
}

async function buildAndSaveHistory(batchFiles) {
    const items = [];
    for (const f of batchFiles) {
        const isDone = f.status === 'completed';
        const thumb = await createCompactHistoryThumb(f.thumb || f.data);
        items.push({
            name: f.name,
            thumb,
            status: isDone ? 'completed' : 'failed',
            info: f.info || (isDone ? 'Completed' : 'Incomplete / Not processed')
        });
    }
    lastBatchHistory = items;
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(lastBatchHistory));
    } catch (e) {
        console.warn('Could not persist batch history to localStorage:', e);
    }
}

function renderHistoryView(filter = 'all') {
    isShowingHistory = true;
    const hasItems = Array.isArray(lastBatchHistory) && lastBatchHistory.length > 0;

    if (hudMainWorkspace) {
        hudMainWorkspace.classList.add('history-mode');
        hudMainWorkspace.classList.toggle('history-empty', !hasItems);
    }
    if (historyBar) historyBar.style.display = 'flex';

    if (!hasItems) {
        if (historyEmptyNote) historyEmptyNote.style.display = 'inline';
        if (filterAllBtn) filterAllBtn.style.display = 'none';
        if (filterCompletedBtn) filterCompletedBtn.style.display = 'none';
        if (filterFailedBtn) filterFailedBtn.style.display = 'none';
        if (clearHistoryBtn) clearHistoryBtn.disabled = true;
        filePreviewBox.innerHTML = '';
        filePreviewBox.style.display = 'none';
        return;
    }

    const totalCount = lastBatchHistory.length;
    const completedCount = lastBatchHistory.filter(i => i.status === 'completed').length;
    const failedCount = totalCount - completedCount;

    if (historyEmptyNote) historyEmptyNote.style.display = 'none';
    if (clearHistoryBtn) clearHistoryBtn.disabled = false;

    if (filterAllBtn) {
        filterAllBtn.style.display = 'inline-flex';
        filterAllBtn.innerText = `All (${totalCount})`;
        filterAllBtn.classList.toggle('active', filter === 'all');
    }
    if (filterCompletedBtn) {
        filterCompletedBtn.style.display = 'inline-flex';
        filterCompletedBtn.innerText = `Completed (${completedCount})`;
        filterCompletedBtn.classList.toggle('active', filter === 'completed');
    }
    if (filterFailedBtn) {
        filterFailedBtn.style.display = 'inline-flex';
        filterFailedBtn.innerText = `Incomplete (${failedCount})`;
        filterFailedBtn.classList.toggle('active', filter === 'failed');
    }

    filePreviewBox.style.display = 'flex';
    filePreviewBox.innerHTML = '';

    const filtered = lastBatchHistory.filter(item => {
        if (filter === 'completed') return item.status === 'completed';
        if (filter === 'failed') return item.status !== 'completed';
        return true;
    });

    if (filtered.length === 0) {
        const msg = document.createElement('span');
        msg.style.color = 'var(--text-muted)';
        msg.style.fontSize = '12px';
        msg.style.padding = '8px 0';
        msg.innerText = filter === 'failed'
            ? 'All images in the last batch completed successfully.'
            : 'No images in this category.';
        filePreviewBox.appendChild(msg);
        return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach(item => {
        const isDone = item.status === 'completed';
        const wrapper = document.createElement('div');
        wrapper.className = `thumb-wrapper ${isDone ? 'completed' : 'failed'}`;
        wrapper.title = `${item.name} — ${isDone ? 'Completed' : 'Incomplete'}${item.info ? ` (${item.info})` : ''}`;

        const img = document.createElement('img');
        img.decoding = 'async';
        img.src = item.thumb;
        img.alt = item.name;

        const checkmark = document.createElement('div');
        checkmark.className = 'checkmark';
        checkmark.innerHTML = SVG_ICONS.check;

        const failmark = document.createElement('div');
        failmark.className = 'failmark';
        failmark.innerHTML = SVG_ICONS.fail;

        wrapper.appendChild(img);
        wrapper.appendChild(checkmark);
        wrapper.appendChild(failmark);
        fragment.appendChild(wrapper);
    });
    filePreviewBox.appendChild(fragment);
}

function clearBatchHistory() {
    lastBatchHistory = [];
    try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (e) {}
    renderHistoryView('all');
    showToast('Batch checkbox history cleared.');
}

function loadSavedHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                lastBatchHistory = parsed;
            }
        }
    } catch (e) {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
    }
    renderHistoryView('all');
}

if (filterAllBtn) filterAllBtn.addEventListener('click', () => renderHistoryView('all'));
if (filterCompletedBtn) filterCompletedBtn.addEventListener('click', () => renderHistoryView('completed'));
if (filterFailedBtn) filterFailedBtn.addEventListener('click', () => renderHistoryView('failed'));
if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearBatchHistory);

// Load gallery & saved checkbox history automatically on startup
window.addEventListener('DOMContentLoaded', () => {
    window.api.refreshGallery();
    loadSavedHistory();
});

// ==========================================================
// 🚀 LIVE AUTO-UPDATE POPUP LOGIC
// ==========================================================
if (window.api.onAppVersion) {
    window.api.onAppVersion((ver) => {
        if (appVersionBadge && ver) {
            appVersionBadge.innerText = `v${ver}`;
        }
    });
}

if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', () => {
        showToast("Checking online for updates...");
        window.api.checkForUpdate(true);
    });
}

if (window.api.onUpdateAvailable) {
    window.api.onUpdateAvailable((info) => {
        if (isViewVisible) {
            setWebsiteViewMode(false);
        }
        updateVersionPill.innerText = `v${info.currentVersion} → v${info.newVersion}`;
        updateNotesBox.innerText = stripLeadingEmojis(info.notes) || "New features and bug fixes are ready to install!";
        updateStatusText.style.display = 'none';
        confirmUpdateBtn.disabled = false;
        confirmUpdateBtn.innerHTML = `${SVG_ICONS.bolt}<span>Update &amp; Restart Now</span>`;
        closeUpdateModalBtn.style.display = 'inline-flex';
        updateModalOverlay.style.display = 'flex';
    });
}

if (confirmUpdateBtn) {
    confirmUpdateBtn.addEventListener('click', () => {
        confirmUpdateBtn.disabled = true;
        confirmUpdateBtn.innerText = "Updating...";
        closeUpdateModalBtn.style.display = 'none';
        updateStatusText.style.display = 'block';
        updateStatusText.style.color = 'var(--accent)';
        updateStatusText.innerText = "Downloading latest code files...";
        window.api.startLiveUpdate();
    });
}

if (closeUpdateModalBtn) {
    closeUpdateModalBtn.addEventListener('click', () => {
        updateModalOverlay.style.display = 'none';
    });
}

if (window.api.onUpdateStatus) {
    window.api.onUpdateStatus((status) => {
        if (status.type === 'progress') {
            updateStatusText.style.display = 'block';
            updateStatusText.style.color = 'var(--accent)';
            updateStatusText.innerText = stripLeadingEmojis(status.message);
        } else if (status.type === 'error') {
            updateStatusText.style.display = 'block';
            updateStatusText.style.color = '#ef4444';
            updateStatusText.innerText = stripLeadingEmojis(status.message);
            confirmUpdateBtn.disabled = false;
            confirmUpdateBtn.innerHTML = `${SVG_ICONS.refresh}<span>Retry Update</span>`;
            closeUpdateModalBtn.style.display = 'inline-flex';
        } else if (status.type === 'toast') {
            showToast(status.message, 4000);
        }
    });
}

// ==========================================================
// ⚡ INSTANT, FRAME-SYNCED WEBSITE POPUP TOGGLE
// ==========================================================
function setWebsiteViewMode(visible) {
    if (isViewVisible === visible) return;
    isViewVisible = visible;

    document.body.classList.toggle('view-active', isViewVisible);
    toggleViewBtn.innerHTML = isViewVisible
        ? `${SVG_ICONS.eyeOff}<span>Hide Website</span>`
        : `${SVG_ICONS.globe}<span>Show Website / Login</span>`;

    requestAnimationFrame(() => {
        window.api.toggleView(isViewVisible);
    });
}

toggleViewBtn.addEventListener('click', () => {
    setWebsiteViewMode(!isViewVisible);
});

selectFileBtn.addEventListener('click', () => fileInput.click());

clearAllBtn.addEventListener('click', () => {
    selectedFiles = [];
    filePreviewBox.innerHTML = '';
    updateQueueText();
});

function updateQueueText() {
    if (selectedFiles.length === 0) {
        startBtn.disabled = true;
        clearAllBtn.style.display = 'none';
        renderHistoryView('all');
        return;
    }

    isShowingHistory = false;
    if (hudMainWorkspace) {
        hudMainWorkspace.classList.remove('history-mode', 'history-empty');
    }
    if (historyBar) historyBar.style.display = 'none';
    filePreviewBox.style.display = 'flex';
    startBtn.disabled = false;
    clearAllBtn.style.display = 'inline-flex';

    let textEl = document.getElementById('previewCountText');
    if (!textEl) {
        textEl = document.createElement('span');
        textEl.id = 'previewCountText';
        textEl.style.color = 'var(--accent)';
        textEl.style.fontSize = '12px';
        textEl.style.fontWeight = '600';
        textEl.style.width = '100%';
        textEl.style.marginTop = '4px';
        filePreviewBox.appendChild(textEl);
    }

    textEl.innerText = `${selectedFiles.length} images ready in queue`;
}

async function processSelectedFiles(filesArray) {
    if (filesArray.length > 0) {
        const imageFiles = filesArray.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        if (isShowingHistory) {
            isShowingHistory = false;
            if (hudMainWorkspace) hudMainWorkspace.classList.remove('history-mode', 'history-empty');
            if (historyBar) historyBar.style.display = 'none';
            filePreviewBox.innerHTML = '';
        }

        const existingText = document.getElementById('previewCountText');
        if (existingText) existingText.remove();

        for (let file of imageFiles) {
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.readAsDataURL(file);
            });

            const thumbUrl = await getLightweightThumbnail(base64);
            const currentId = 'thumb-' + fileIdCounter++;

            selectedFiles.push({
                id: currentId,
                name: file.name,
                type: file.type,
                data: base64,
                thumb: thumbUrl,
                status: 'pending',
                info: ''
            });

            const wrapper = document.createElement('div');
            wrapper.className = 'thumb-wrapper';
            wrapper.id = 'wrapper-' + currentId;
            wrapper.title = file.name;

            const img = document.createElement('img');
            img.decoding = 'async';
            img.src = thumbUrl;
            img.title = file.name;

            const delBtn = document.createElement('div');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = SVG_ICONS.close;
            delBtn.title = "Remove from queue";

            const checkmark = document.createElement('div');
            checkmark.className = 'checkmark';
            checkmark.innerHTML = SVG_ICONS.check;

            const failmark = document.createElement('div');
            failmark.className = 'failmark';
            failmark.innerHTML = SVG_ICONS.fail;

            delBtn.onclick = () => {
                selectedFiles = selectedFiles.filter(f => f.id !== currentId);
                wrapper.remove();
                updateQueueText();
            };

            wrapper.appendChild(img);
            wrapper.appendChild(checkmark);
            wrapper.appendChild(failmark);
            wrapper.appendChild(delBtn);
            filePreviewBox.appendChild(wrapper);
        }
        updateQueueText();
    }
}

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    await processSelectedFiles(files);
    fileInput.value = '';
});

// ==========================================================
// 🔥 DRAG AND DROP LOGIC
// ==========================================================
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

['dragenter', 'dragover'].forEach(eventName => {
    glassCard.addEventListener(eventName, () => {
        glassCard.classList.add('drag-over');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    glassCard.addEventListener(eventName, () => {
        glassCard.classList.remove('drag-over');
    }, false);
});

glassCard.addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer.files);
    await processSelectedFiles(files);
});

// ==========================================================
// 🚀 WORKFLOW & GALLERY LOGIC
// ==========================================================
refreshGalleryBtn.addEventListener('click', () => {
    galleryGrid.innerHTML = '<p style="font-size: 12px; color: var(--accent); text-align: center; grid-column: 1 / -1; margin: 20px 0;">Loading saved PNGs...</p>';
    window.api.refreshGallery();
});

window.api.onGalleryData(async (images) => {
    galleryGrid.innerHTML = '';
    if (!images || images.length === 0) {
        galleryGrid.innerHTML = '<p style="font-size: 12px; color: var(--text-muted); text-align: center; grid-column: 1 / -1; margin: 20px 0;">No processed transparent PNGs found yet.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    images.forEach(src => {
        const img = document.createElement('img');
        img.decoding = 'async';
        img.loading = 'lazy';
        img.title = "Click to show in folder";
        img.onclick = () => {
            if (window.api.openFileLocation) {
                window.api.openFileLocation(src);
            }
        };
        fragment.appendChild(img);

        getLightweightThumbnail(src).then(thumbSrc => {
            img.src = thumbSrc;
        });
    });
    galleryGrid.appendChild(fragment);
});

function startProcessMode(title, isRemoveBg) {
    isShowingHistory = false;
    if (hudMainWorkspace) hudMainWorkspace.classList.remove('history-mode', 'history-empty');
    if (historyBar) historyBar.style.display = 'none';

    setWebsiteViewMode(true);

    controls.style.display = 'none';
    galleryContainer.style.display = 'none';

    document.querySelectorAll('.delete-btn').forEach(btn => btn.style.display = 'none');

    progressWrapper.style.display = 'block';
    progressBar.style.width = '0%';
    percentText.innerText = '0%';
    progressText.innerText = stripLeadingEmojis(title);
    progressText.style.color = 'var(--accent)';
    scannerLine.style.background = 'linear-gradient(90deg, transparent, var(--accent-bright), #ffffff, var(--accent-bright), transparent)';

    if (isRemoveBg && selectedFiles.length > 0) {
        processingImage.src = selectedFiles[0].thumb || selectedFiles[0].data;
        processingPreviewContainer.style.display = 'flex';
    } else {
        processingPreviewContainer.style.display = 'none';
    }
}

startBtn.addEventListener('click', () => {
    if (selectedFiles.length === 0) return;
    startProcessMode("Initializing Batch Processor...", true);
    const payloadFiles = selectedFiles.map(({ id, name, type, data }) => ({ id, name, type, data }));
    setTimeout(() => {
        window.api.startBatchTask(payloadFiles);
    }, 50);
});

window.api.onProgressUpdate((data) => {
    let percent = parseInt(data.percent);
    if (!isNaN(percent)) {
        progressBar.style.width = percent + '%';
        percentText.innerText = percent + '%';
    }
    if (data.text) {
        progressText.innerText = stripLeadingEmojis(data.text);
    }

    if (data.activeIndex !== undefined && data.activeIndex >= 0) {
        const activeFile = selectedFiles[data.activeIndex];

        if (activeFile) {
            processingImage.src = activeFile.thumb || activeFile.data;
            const thumbWrapper = document.getElementById('wrapper-' + activeFile.id);
            const isItemFailed = Boolean(data.isFailed) || (!data.isCompleted && typeof data.text === 'string' && data.text.includes('❌'));

            if (data.isCompleted) {
                activeFile.status = 'completed';
                activeFile.info = stripLeadingEmojis(data.text || 'Completed');
                if (thumbWrapper) {
                    thumbWrapper.classList.remove('failed');
                    thumbWrapper.classList.add('completed');
                    thumbWrapper.title = `${activeFile.name} — Completed (${activeFile.info})`;
                }
            } else if (isItemFailed) {
                activeFile.status = 'failed';
                activeFile.info = stripLeadingEmojis(data.text || 'Incomplete');
                if (thumbWrapper) {
                    thumbWrapper.classList.remove('completed');
                    thumbWrapper.classList.add('failed');
                    thumbWrapper.title = `${activeFile.name} — Incomplete (${activeFile.info})`;
                }
            }

            if (data.isCompleted || isItemFailed) {
                const countText = document.getElementById('previewCountText');
                if (countText) {
                    const doneCount = selectedFiles.filter(f => f.status === 'completed').length;
                    const failCount = selectedFiles.filter(f => f.status === 'failed').length;
                    const remaining = selectedFiles.length - (doneCount + failCount);
                    if (remaining > 0) {
                        countText.innerText = `${remaining} remaining • ${doneCount} completed • ${failCount} incomplete`;
                    } else {
                        countText.innerText = `Finished: ${doneCount} completed • ${failCount} incomplete`;
                    }
                }
            }
        }
    }
});

window.api.onStatusUpdate((message) => {
    if (message.includes("✅") || message.includes("❌")) {
        const isSuccess = message.includes("✅");
        progressText.innerText = stripLeadingEmojis(message);
        progressText.style.color = isSuccess ? '#10b981' : '#ef4444';

        if (isSuccess) {
            progressBar.style.width = '100%';
            percentText.innerText = '100%';
            scannerLine.style.background = '#10b981';
        }

        const finishedBatch = [...selectedFiles];
        const historyPrepPromise = finishedBatch.length > 0
            ? buildAndSaveHistory(finishedBatch)
            : Promise.resolve();

        setTimeout(async () => {
            await historyPrepPromise;

            selectedFiles = [];
            startBtn.disabled = true;
            clearAllBtn.style.display = 'none';

            controls.style.display = 'flex';
            toggleViewBtn.style.display = 'inline-flex';
            progressWrapper.style.display = 'none';
            processingPreviewContainer.style.display = 'none';
            galleryContainer.style.display = 'flex';

            renderHistoryView('all');
            window.api.refreshGallery();
        }, 3000);
    }
});
