const selectFileBtn = document.getElementById('selectFileBtn');
const fileInput = document.getElementById('fileInput');
const startBtn = document.getElementById('startBtn');
const clearAllBtn = document.getElementById('clearAllBtn'); 
const toggleViewBtn = document.getElementById('toggleViewBtn');
const toggleViewIcon = document.getElementById('toggleViewIcon');
const toggleViewLabel = document.getElementById('toggleViewLabel');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const appVersionBadge = document.getElementById('appVersionBadge');

const controls = document.getElementById('controls');
const progressWrapper = document.getElementById('progressWrapper');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const percentText = document.getElementById('percentText');

const refreshGalleryBtn = document.getElementById('refreshGalleryBtn');
const clearGalleryBtn = document.getElementById('clearGalleryBtn');
const galleryGrid = document.getElementById('galleryGrid');
const galleryContainer = document.getElementById('galleryContainer');

const filePreviewBox = document.getElementById('filePreviewBox');
const processingPreviewContainer = document.getElementById('processingPreviewContainer');
const processingImage = document.getElementById('processingImage');
const scannerLine = document.getElementById('scannerLine');
const glassCard = document.querySelector('.glass-card');

// Update Modal Elements
const updateModalOverlay = document.getElementById('updateModalOverlay');
const updateVersionPill = document.getElementById('updateVersionPill');
const updateNotesBox = document.getElementById('updateNotesBox');
const updateStatusText = document.getElementById('updateStatusText');
const confirmUpdateBtn = document.getElementById('confirmUpdateBtn');
const confirmUpdateLabel = document.getElementById('confirmUpdateLabel');
const closeUpdateModalBtn = document.getElementById('closeUpdateModalBtn');
const toastBanner = document.getElementById('toastBanner');

let selectedFiles = []; 
let fileIdCounter = 0; 
let isViewVisible = false; 
let galleryRenderId = 0;

function stripEmojis(str) {
    return String(str || '')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function showToast(msg, duration = 3500) {
    if (!toastBanner) return;
    toastBanner.innerText = stripEmojis(msg);
    toastBanner.style.display = 'block';
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
        toastBanner.style.display = 'none';
    }, duration);
}

// Cache for 128x128 gallery thumbnails so 5000x5000px PNGs never lag the UI
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
        tempImg.onerror = () => resolve(null);
        tempImg.src = src;
    });
}

// Load gallery automatically on startup
window.addEventListener('DOMContentLoaded', () => {
    window.api.refreshGallery();
});

// ==========================================================
// 🌙 TELEGRAM-STYLE NIGHT / LIGHT MODE TOGGLE
// ==========================================================
function applyTheme(isLight) {
    document.documentElement.classList.toggle('light-mode', isLight);
    document.body.classList.toggle('light-mode', isLight);
    if (themeToggleBtn) {
        themeToggleBtn.title = isLight ? 'Switch to Night Mode' : 'Switch to Light Mode';
    }
}

const savedTheme = localStorage.getItem('pixelcut_theme');
applyTheme(savedTheme === 'light');

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const isNowLight = !document.body.classList.contains('light-mode');
        applyTheme(isNowLight);
        localStorage.setItem('pixelcut_theme', isNowLight ? 'light' : 'dark');
    });
}

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
        updateNotesBox.innerText = stripEmojis(info.notes) || "New features and improvements are ready to install!";
        updateStatusText.style.display = 'none';
        confirmUpdateBtn.disabled = false;
        if (confirmUpdateLabel) confirmUpdateLabel.innerText = "Update & Restart Now";
        closeUpdateModalBtn.style.display = 'inline-flex';
        updateModalOverlay.style.display = 'flex';
    });
}

if (confirmUpdateBtn) {
    confirmUpdateBtn.addEventListener('click', () => {
        confirmUpdateBtn.disabled = true;
        if (confirmUpdateLabel) confirmUpdateLabel.innerText = "Updating...";
        closeUpdateModalBtn.style.display = 'none';
        updateStatusText.style.display = 'block';
        updateStatusText.style.color = '#0ea5e9';
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
            updateStatusText.style.color = '#0ea5e9';
            updateStatusText.innerText = stripEmojis(status.message);
        } else if (status.type === 'error') {
            updateStatusText.style.display = 'block';
            updateStatusText.style.color = '#ef4444';
            updateStatusText.innerText = stripEmojis(status.message);
            confirmUpdateBtn.disabled = false;
            if (confirmUpdateLabel) confirmUpdateLabel.innerText = "Retry Update";
            closeUpdateModalBtn.style.display = 'inline-flex';
        } else if (status.type === 'toast') {
            showToast(status.message, 4000);
        }
    });
}

// ==========================================================
// ⚡ INSTANT, FRAME-SYNCED WEBSITE POPUP TOGGLE
// ==========================================================
const GLOBE_ICON_PATHS = '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>';
const EYE_OFF_ICON_PATHS = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';

function setWebsiteViewMode(visible) {
    if (isViewVisible === visible) return;
    isViewVisible = visible;

    document.body.classList.toggle('view-active', isViewVisible);
    if (toggleViewLabel) {
        toggleViewLabel.innerText = isViewVisible ? "Hide Website" : "Show Website / Login";
    }
    if (toggleViewIcon) {
        toggleViewIcon.innerHTML = isViewVisible ? EYE_OFF_ICON_PATHS : GLOBE_ICON_PATHS;
    }

    let sent = false;
    const syncMainView = () => {
        if (sent) return;
        sent = true;
        window.api.toggleView(isViewVisible);
    };
    requestAnimationFrame(syncMainView);
    setTimeout(syncMainView, 40);
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
    let textEl = document.getElementById('previewCountText');
    if (!textEl) {
        textEl = document.createElement('span');
        textEl.id = 'previewCountText';
        textEl.style.color = '#38bdf8';
        textEl.style.fontSize = '12px';
        textEl.style.fontWeight = '600';
        textEl.style.width = '100%'; 
        textEl.style.marginTop = '4px';
        filePreviewBox.appendChild(textEl);
    }
    
    textEl.innerText = `${selectedFiles.length} images ready in queue`;
    
    if (selectedFiles.length === 0) {
        filePreviewBox.style.display = 'none';
        startBtn.disabled = true;
        clearAllBtn.style.display = 'none'; 
    } else {
        filePreviewBox.style.display = 'flex';
        startBtn.disabled = false;
        clearAllBtn.style.display = 'inline-flex'; 
    }
}

async function processSelectedFiles(filesArray) {
    if (filesArray.length > 0) {
        const existingText = document.getElementById('previewCountText');
        if (existingText) existingText.remove();

        const imageFiles = filesArray.filter(file => file.type.startsWith('image/'));

        for (let file of imageFiles) {
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.readAsDataURL(file);
            });
            
            const currentId = 'thumb-' + fileIdCounter++; 
            
            selectedFiles.push({ id: currentId, name: file.name, type: file.type, data: base64 });
            
            const wrapper = document.createElement('div');
            wrapper.className = 'thumb-wrapper';
            wrapper.id = 'wrapper-' + currentId;
            
            const img = document.createElement('img');
            img.decoding = 'async';
            img.src = base64;
            img.title = file.name;
            
            const delBtn = document.createElement('div');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            delBtn.title = "Remove from queue";
            
            const checkmark = document.createElement('div');
            checkmark.className = 'checkmark';
            checkmark.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

            delBtn.onclick = () => {
                selectedFiles = selectedFiles.filter(f => f.id !== currentId); 
                wrapper.remove(); 
                updateQueueText(); 
            };
            
            wrapper.appendChild(img);
            wrapper.appendChild(checkmark); 
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
    galleryGrid.innerHTML = '<p style="font-size: 12px; color: #0ea5e9; text-align: center; grid-column: 1 / -1; margin: 20px 0;">Loading saved PNGs...</p>';
    window.api.refreshGallery();
});

if (clearGalleryBtn) {
    clearGalleryBtn.addEventListener('click', () => {
        galleryRenderId++;
        galleryThumbCache.clear();
        galleryGrid.innerHTML = '<p style="font-size: 12px; color: #64748b; text-align: center; width: 100%; grid-column: 1 / -1; margin: 20px 0;">Gallery cleared. Click "Refresh" to view saved transparent PNGs.</p>';
    });
}

window.api.onGalleryData(async (images) => {
    const currentRenderId = ++galleryRenderId;
    galleryGrid.innerHTML = ''; 
    if (!images || images.length === 0) {
        galleryGrid.innerHTML = '<p style="font-size: 12px; color: #64748b; text-align: center; width: 100%; grid-column: 1 / -1; margin: 20px 0;">No processed transparent PNGs found yet.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    const imgElements = images.map((src) => {
        const img = document.createElement('img');
        img.decoding = 'async';
        img.title = "Click to show in folder";
        img.style.opacity = '0';
        img.onclick = () => {
            if (window.api.openFileLocation) {
                window.api.openFileLocation(src);
            }
        };
        fragment.appendChild(img);
        return { img, src };
    });
    galleryGrid.appendChild(fragment);

    let cursor = 0;
    const workerCount = Math.min(4, imgElements.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (cursor < imgElements.length) {
            if (currentRenderId !== galleryRenderId) return;
            const item = imgElements[cursor++];
            const thumbSrc = await getLightweightThumbnail(item.src);
            if (currentRenderId !== galleryRenderId) return;
            if (thumbSrc) {
                item.img.onload = () => {
                    item.img.style.opacity = '1';
                };
                item.img.src = thumbSrc;
            } else {
                item.img.remove();
            }
        }
    });
    await Promise.all(workers);
});

function startProcessMode(title, isRemoveBg) {
    setWebsiteViewMode(true);

    controls.style.display = 'none'; 
    galleryContainer.style.display = 'none'; 
    
    document.querySelectorAll('.delete-btn').forEach(btn => btn.style.display = 'none');
    
    progressWrapper.style.display = 'block'; 
    progressBar.style.width = '0%';
    percentText.innerText = '0%';
    progressText.innerText = stripEmojis(title);
    progressText.style.color = document.body.classList.contains('light-mode') ? '#0284c7' : '#38bdf8'; 
    scannerLine.style.background = '#38bdf8'; 

    if (isRemoveBg && selectedFiles.length > 0) {
        processingImage.src = selectedFiles[0].data; 
        processingPreviewContainer.style.display = 'flex';
    } else {
        processingPreviewContainer.style.display = 'none';
    }
}

startBtn.addEventListener('click', () => {
    if (selectedFiles.length === 0) return;
    startProcessMode("Initializing Batch Processor...", true);
    window.api.startBatchTask(selectedFiles); 
});

window.api.onProgressUpdate((data) => {
    let percent = parseInt(data.percent);
    if (!isNaN(percent)) {
        progressBar.style.width = percent + '%';
        percentText.innerText = percent + '%';
    }
    if (data.text) {
        progressText.innerText = stripEmojis(data.text);
    }

    if (data.activeIndex !== undefined && data.activeIndex >= 0) {
        const activeFile = selectedFiles[data.activeIndex];
        
        if (activeFile) {
            processingImage.src = activeFile.data;
            
            if (data.isCompleted) {
                const thumbWrapper = document.getElementById('wrapper-' + activeFile.id);
                if (thumbWrapper) {
                    thumbWrapper.classList.add('completed');
                }
                
                const countText = document.getElementById('previewCountText');
                if (countText) {
                    const remaining = selectedFiles.length - (data.activeIndex + 1);
                    if (remaining > 0) {
                        countText.innerText = `${remaining} images remaining...`;
                    } else {
                        countText.innerText = `All images completed!`;
                    }
                }
            }
        }
    }
});

window.api.onStatusUpdate((message) => {
    const isSuccess = message.includes("✅");
    const isError = message.includes("❌");

    if (isSuccess || isError) {
        progressText.innerText = stripEmojis(message);
        progressText.style.color = isSuccess ? '#10b981' : '#ef4444'; 
        
        if (isSuccess) {
            progressBar.style.width = '100%';
            percentText.innerText = '100%';
            scannerLine.style.background = '#10b981';
        }
        
        setTimeout(() => {
            setWebsiteViewMode(false);
            selectedFiles = [];
            filePreviewBox.innerHTML = '';
            filePreviewBox.style.display = 'none';
            startBtn.disabled = true;
            clearAllBtn.style.display = 'none';

            controls.style.display = 'flex';
            toggleViewBtn.style.display = 'inline-flex';
            progressWrapper.style.display = 'none';
            processingPreviewContainer.style.display = 'none'; 
            galleryContainer.style.display = 'flex'; 
            window.api.refreshGallery(); 
        }, 3000); 
    }
});
