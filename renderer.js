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

function showToast(msg, duration = 3500) {
    if (!toastBanner) return;
    toastBanner.innerText = msg;
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
        tempImg.onerror = () => resolve(src);
        tempImg.src = src;
    });
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
        // যদি ওয়েবসাইট ভিউ ওপেন থাকে, পপআপ দেখানোর জন্য সাময়িকভাবে হাইড করা হবে যেন পপআপ পরিষ্কার দেখা যায়
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

window.api.onGalleryData(async (images) => {
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

        getLightweightThumbnail(src).then(thumbSrc => {
            img.src = thumbSrc;
        });
    });
    galleryGrid.appendChild(fragment);
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
        processingImage.src = selectedFiles[0].data; 
        processingPreviewContainer.style.display = 'flex';
    } else {
        processingPreviewContainer.style.display = 'none';
    }
}

startBtn.addEventListener('click', () => {
    if (selectedFiles.length === 0) return;
    startProcessMode("⚙️ Initializing Batch Processor...", true);
    window.api.startBatchTask(selectedFiles); 
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