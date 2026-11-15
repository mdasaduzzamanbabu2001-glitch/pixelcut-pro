const selectFileBtn = document.getElementById('selectFileBtn');
const fileInput = document.getElementById('fileInput');
const startBtn = document.getElementById('startBtn');
const clearAllBtn = document.getElementById('clearAllBtn'); 
const toggleViewBtn = document.getElementById('toggleViewBtn');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const appVersionBadge = document.getElementById('appVersionBadge');

const controls = document.getElementById('controls');
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

// Update Modal Elements
const updateModalOverlay = document.getElementById('updateModalOverlay');
const updateVersionPill = document.getElementById('updateVersionPill');
const updateNotesBox = document.getElementById('updateNotesBox');
const updateStatusText = document.getElementById('updateStatusText');
const confirmUpdateBtn = document.getElementById('confirmUpdateBtn');
const closeUpdateModalBtn = document.getElementById('closeUpdateModalBtn');
const toastBanner = document.getElementById('toastBanner');

let selectedFiles = []; 
let fileIdCounter = 0; 
let isViewVisible = false; 
let lastProcessingFileId = null;

function showToast(msg, duration = 3500) {
    if (!toastBanner) return;
    toastBanner.innerText = msg;
    toastBanner.style.display = 'block';
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
        toastBanner.style.display = 'none';
    }, duration);
}

// ==========================================================
// 🖼️ ZERO-LAG SEQUENTIAL GALLERY & UI THUMBNAIL ENGINE
// ==========================================================
const galleryThumbCache = new Map();
const thumbPendingQueue = [];
let isDecodingThumb = false;
let latestPendingGalleryImages = null;

function decodeImageToThumbnail(src, maxDim = 128) {
    return new Promise((resolve) => {
        const tempImg = new Image();
        tempImg.decoding = 'async';
        tempImg.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const scale = Math.min(maxDim / (tempImg.width || 1), maxDim / (tempImg.height || 1), 1);
                canvas.width = Math.max(1, Math.round((tempImg.width || 1) * scale));
                canvas.height = Math.max(1, Math.round((tempImg.height || 1) * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);
                const thumbDataUrl = canvas.toDataURL('image/webp', 0.85);
                canvas.width = 0;
                canvas.height = 0;
                tempImg.src = '';
                resolve(thumbDataUrl);
            } catch (err) {
                resolve(src);
            }
        };
        tempImg.onerror = () => resolve(src);
        tempImg.src = src;
    });
}

function processNextGalleryThumb() {
    if (isDecodingThumb || thumbPendingQueue.length === 0) return;
    // Pause heavy 5000px PNG decoding whenever website view or processing is active
    if (isViewVisible || controls.style.display === 'none') return;

    isDecodingThumb = true;
    const { src, imgEl } = thumbPendingQueue.shift();

    if (galleryThumbCache.has(src)) {
        imgEl.src = galleryThumbCache.get(src);
        isDecodingThumb = false;
        setTimeout(processNextGalleryThumb, 0);
        return;
    }

    decodeImageToThumbnail(src, 128).then((thumbDataUrl) => {
        if (galleryThumbCache.size > 48) {
            const oldestKey = galleryThumbCache.keys().next().value;
            galleryThumbCache.delete(oldestKey);
        }
        galleryThumbCache.set(src, thumbDataUrl);
        if (imgEl.isConnected) {
            imgEl.src = thumbDataUrl;
        }
    }).finally(() => {
        isDecodingThumb = false;
        setTimeout(processNextGalleryThumb, 16);
    });
}

function renderGalleryImages(images) {
    thumbPendingQueue.length = 0;
    galleryGrid.innerHTML = '';

    if (!images || images.length === 0) {
        galleryGrid.innerHTML = '<p style="font-size: 12px; color: #64748b; text-align: center; grid-column: 1 / -1; margin: 20px 0;">No processed transparent PNGs found yet.</p>';
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

        if (galleryThumbCache.has(src)) {
            img.src = galleryThumbCache.get(src);
        } else {
            thumbPendingQueue.push({ src, imgEl: img });
        }
    });
    galleryGrid.appendChild(fragment);
    processNextGalleryThumb();
}

async function createUiThumbnail(file, fallbackBase64) {
    try {
        if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(file);
            const maxDim = 180;
            const scale = Math.min(maxDim / (bitmap.width || 1), maxDim / (bitmap.height || 1), 1);
            const w = Math.max(1, Math.round((bitmap.width || 1) * scale));
            const h = Math.max(1, Math.round((bitmap.height || 1) * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, w, h);
            bitmap.close();
            const thumbUrl = canvas.toDataURL('image/webp', 0.82);
            canvas.width = 0;
            canvas.height = 0;
            return thumbUrl;
        }
    } catch (e) {}
    return decodeImageToThumbnail(fallbackBase64, 180);
}

// Load gallery automatically on startup
window.addEventListener('DOMContentLoaded', () => {
    window.api.refreshGallery();
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
        showToast("🔍 Checking online for updates...");
        window.api.checkForUpdate(true);
    });
}

if (window.api.onUpdateAvailable) {
    window.api.onUpdateAvailable((info) => {
        if (isViewVisible) {
            setWebsiteViewMode(false);
        }
        updateVersionPill.innerText = `v${info.currentVersion} ➔ v${info.newVersion}`;
        updateNotesBox.innerText = info.notes || "✨ New features and bug fixes are ready to install!";
        updateStatusText.style.display = 'none';
        confirmUpdateBtn.disabled = false;
        confirmUpdateBtn.innerText = "⚡ Update & Restart Now";
        closeUpdateModalBtn.style.display = 'inline-block';
        updateModalOverlay.style.display = 'flex';
    });
}

if (confirmUpdateBtn) {
    confirmUpdateBtn.addEventListener('click', () => {
        confirmUpdateBtn.disabled = true;
        confirmUpdateBtn.innerText = "⏳ Updating...";
        closeUpdateModalBtn.style.display = 'none';
        updateStatusText.style.display = 'block';
        updateStatusText.style.color = '#38bdf8';
        updateStatusText.innerText = "📥 Downloading latest code files (2 sec)...";
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
            updateStatusText.style.color = '#38bdf8';
            updateStatusText.innerText = status.message;
        } else if (status.type === 'error') {
            updateStatusText.style.display = 'block';
            updateStatusText.style.color = '#ef4444';
            updateStatusText.innerText = status.message;
            confirmUpdateBtn.disabled = false;
            confirmUpdateBtn.innerText = "🔄 Retry Update";
            closeUpdateModalBtn.style.display = 'inline-block';
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
    toggleViewBtn.innerText = isViewVisible ? "🙈 Hide Website" : "🌐 Show Website / Login";

    requestAnimationFrame(() => {
        window.api.toggleView(isViewVisible);
        if (!isViewVisible && latestPendingGalleryImages) {
            const pending = latestPendingGalleryImages;
            latestPendingGalleryImages = null;
            renderGalleryImages(pending);
        } else if (!isViewVisible) {
            processNextGalleryThumb();
        }
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
        clearAllBtn.style.display = 'inline-block'; 
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
            const thumbUrl = await createUiThumbnail(file, base64);
            
            const currentId = 'thumb-' + fileIdCounter++; 
            
            selectedFiles.push({
                id: currentId,
                name: file.name,
                type: file.type,
                data: base64,
                thumb: thumbUrl
            });
            
            const wrapper = document.createElement('div');
            wrapper.className = 'thumb-wrapper';
            wrapper.id = 'wrapper-' + currentId;
            
            const img = document.createElement('img');
            img.decoding = 'async';
            img.src = thumbUrl;
            img.title = file.name;
            
            const delBtn = document.createElement('div');
            delBtn.className = 'delete-btn';
            delBtn.innerText = '✖';
            delBtn.title = "Remove from queue";
            
            const checkmark = document.createElement('div');
            checkmark.className = 'checkmark';
            checkmark.innerText = '✅';

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
    galleryGrid.innerHTML = '<p style="font-size: 12px; color: #38bdf8; text-align: center; grid-column: 1 / -1; margin: 20px 0;">✨ Loading saved PNGs...</p>';
    window.api.refreshGallery();
});

window.api.onGalleryData((images) => {
    if (isViewVisible || controls.style.display === 'none') {
        latestPendingGalleryImages = images;
        return;
    }
    latestPendingGalleryImages = null;
    renderGalleryImages(images);
});

function startProcessMode(title, isRemoveBg) {
    setWebsiteViewMode(true);

    controls.style.display = 'none'; 
    galleryContainer.style.display = 'none'; 
    
    document.querySelectorAll('.delete-btn').forEach(btn => btn.style.display = 'none');
    
    progressWrapper.style.display = 'block'; 
    progressBar.style.width = '0%';
    percentText.innerText = '0%';
    progressText.innerText = title;
    progressText.style.color = '#38bdf8'; 
    scannerLine.style.background = '#38bdf8'; 

    if (isRemoveBg && selectedFiles.length > 0) {
        lastProcessingFileId = selectedFiles[0].id;
        processingImage.src = selectedFiles[0].thumb || selectedFiles[0].data; 
        processingPreviewContainer.style.display = 'flex';
    } else {
        lastProcessingFileId = null;
        processingPreviewContainer.style.display = 'none';
    }
}

startBtn.addEventListener('click', () => {
    if (selectedFiles.length === 0) return;
    startProcessMode("⚙️ Initializing Batch Processor...", true);
    const payload = selectedFiles.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        data: f.data
    }));
    requestAnimationFrame(() => {
        setTimeout(() => {
            window.api.startBatchTask(payload);
        }, 20);
    });
});

window.api.onProgressUpdate((data) => {
    let percent = parseInt(data.percent);
    if (!isNaN(percent)) {
        progressBar.style.width = percent + '%';
        percentText.innerText = percent + '%';
    }
    if (data.text) {
        progressText.innerText = data.text;
    }

    if (data.activeIndex !== undefined && data.activeIndex >= 0) {
        const activeFile = selectedFiles[data.activeIndex];
        
        if (activeFile) {
            if (lastProcessingFileId !== activeFile.id) {
                lastProcessingFileId = activeFile.id;
                processingImage.src = activeFile.thumb || activeFile.data;
            }
            
            if (data.isCompleted) {
                const thumbWrapper = document.getElementById('wrapper-' + activeFile.id);
                if (thumbWrapper) {
                    thumbWrapper.classList.add('completed');
                }
                
                const countText = document.getElementById('previewCountText');
                if (countText) {
                    const remaining = selectedFiles.length - (data.activeIndex + 1);
                    if (remaining > 0) {
                        countText.innerText = `⏳ ${remaining} images remaining...`;
                    } else {
                        countText.innerText = `🎉 All images completed!`;
                    }
                }
            }
        }
    }
});

window.api.onStatusUpdate((message) => {
    if (message.includes("✅") || message.includes("❌")) {
        progressText.innerText = message;
        progressText.style.color = message.includes("✅") ? '#10b981' : '#ef4444'; 
        
        if (message.includes("✅")) {
            progressBar.style.width = '100%';
            percentText.innerText = '100%';
            scannerLine.style.background = '#10b981';
        }
        
        setTimeout(() => {
            selectedFiles = [];
            lastProcessingFileId = null;
            processingImage.src = '';
            filePreviewBox.innerHTML = '';
            filePreviewBox.style.display = 'none';
            startBtn.disabled = true;
            clearAllBtn.style.display = 'none';

            controls.style.display = 'flex';
            toggleViewBtn.style.display = 'inline-block';
            progressWrapper.style.display = 'none';
            processingPreviewContainer.style.display = 'none'; 
            galleryContainer.style.display = 'flex'; 
            window.api.refreshGallery(); 
        }, 3000); 
    }
});
